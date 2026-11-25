// AI Notch na barra: uma pílula no lugar do relógio do painel do GNOME.
//
// A extensão só desenha. Todo o estado vem do app AI Notch pelo D-Bus da
// sessão (io.github.ranieryfialho.AiNotch): o app publica um resumo em JSON a
// cada mudança e a extensão pede para abrir/fechar o notch completo, que é a
// janela do próprio app, logo abaixo do painel.
//
// Sem o app rodando, o relógio original do GNOME volta a aparecer.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const NOME = 'io.github.ranieryfialho.AiNotch';
const CAMINHO = '/io/github/ranieryfialho/AiNotch';
const INTERFACE = `
<node>
  <interface name="io.github.ranieryfialho.AiNotch.Barra">
    <method name="Estado"><arg type="s" direction="out"/></method>
    <method name="Conectar"/>
    <method name="Desconectar"/>
    <method name="Abrir"/>
    <method name="Fechar"/>
    <signal name="EstadoMudou"><arg type="s"/></signal>
  </interface>
</node>`;
const ProxyBarra = Gio.DBusProxy.makeProxyWrapper(INTERFACE);

const COR_EQUALIZADOR = '#c4b5fd';

/** Ícones simbólicos do tema para cada tipo de periférico. */
const ICONE_TIPO = {
    headset: 'audio-headset-symbolic',
    fones: 'audio-headphones-symbolic',
    mouse: 'input-mouse-symbolic',
    teclado: 'input-keyboard-symbolic',
    controle: 'input-gaming-symbolic',
    caneta: 'input-tablet-symbolic',
    outro: 'battery-symbolic',
};
const ignorar = () => {};

/** "09:05" a partir de milissegundos. */
function mmss(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function escapar(texto) {
    return GLib.markup_escape_text(texto ?? '', -1);
}

/** "#rrggbb" → [r, g, b] de 0 a 1, para o cairo. */
function rgb(hex) {
    const n = parseInt((hex ?? '#e4e4e7').slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Anel de bateria igual ao do notch: trilho escuro e arco na cor do estado. */
class AnelBateria {
    constructor() {
        this.bateria = null;
        this.actor = new St.DrawingArea({
            style_class: 'ai-notch-anel',
            width: 16,
            height: 16,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.connect('repaint', area => this._desenhar(area));
    }

    definir(bateria) {
        this.bateria = bateria;
        this.actor.visible = !!bateria;
        this.actor.queue_repaint();
    }

    _desenhar(area) {
        const cr = area.get_context();
        const [l, a] = area.get_surface_size();
        const raio = Math.min(l, a) / 2 - 1.5;
        const [cx, cy] = [l / 2, a / 2];
        cr.setLineWidth(2.2);
        cr.setSourceRGBA(1, 1, 1, 0.18);
        cr.arc(cx, cy, raio, 0, 2 * Math.PI);
        cr.stroke();
        if (this.bateria) {
            const [r, g, b] = rgb(this.bateria.cor);
            cr.setSourceRGB(r, g, b);
            const inicio = -Math.PI / 2;
            cr.arc(cx, cy, raio, inicio, inicio + 2 * Math.PI * (this.bateria.percentual / 100));
            cr.stroke();
        }
        cr.$dispose();
    }
}

/** Quatro barrinhas pulando, como o equalizador do notch. */
class Equalizador {
    constructor() {
        this.actor = new St.BoxLayout({style_class: 'ai-notch-equalizador', y_align: Clutter.ActorAlign.CENTER});
        this._barras = [0, 1, 2, 3].map(() => {
            const barra = new St.Widget({
                style_class: 'ai-notch-barra',
                style: `background-color: ${COR_EQUALIZADOR};`,
                y_align: Clutter.ActorAlign.END,
            });
            barra.set_pivot_point(0.5, 1);
            this.actor.add_child(barra);
            return barra;
        });
        this.actor.visible = false;
    }

    definir(tocando) {
        if (tocando === this.actor.visible)
            return;
        this.actor.visible = tocando;
        this._barras.forEach((barra, i) => {
            barra.remove_all_transitions();
            barra.scale_y = 1;
            if (!tocando)
                return;
            barra.scale_y = 0.35;
            barra.ease({
                scale_y: 1,
                duration: 380 + i * 110,
                mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
                repeatCount: -1,
                autoReverse: true,
            });
        });
    }

    destruir() {
        this._barras.forEach(barra => barra.remove_all_transitions());
    }
}

/** A pílula: [capa ou bateria] [hora] [pomodoro, equalizador ou IA], ou um aviso. */
class Pilula {
    constructor(aoEntrar) {
        this.resumo = null;
        this.actor = new St.BoxLayout({
            style_class: 'ai-notch-pilula',
            reactive: true,
            track_hover: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._capa = new St.Icon({style_class: 'ai-notch-capa', icon_size: 16, y_align: Clutter.ActorAlign.CENTER});
        this._anel = new AnelBateria();
        this._hora = new St.Label({style_class: 'ai-notch-hora', y_align: Clutter.ActorAlign.CENTER});
        this._foco = new St.Label({style_class: 'ai-notch-foco', y_align: Clutter.ActorAlign.CENTER});
        this._ia = new St.Label({style_class: 'ai-notch-ia', y_align: Clutter.ActorAlign.CENTER});
        this._equalizador = new Equalizador();
        this._aviso = new St.Label({style_class: 'ai-notch-aviso', y_align: Clutter.ActorAlign.CENTER});
        this._aviso.clutter_text.use_markup = true;
        this._perifericos = new St.BoxLayout({style_class: 'ai-notch-perifericos', y_align: Clutter.ActorAlign.CENTER});
        this._chavePerifericos = '';

        for (const filho of [this._capa, this._anel.actor, this._hora, this._foco, this._equalizador.actor, this._ia, this._perifericos, this._aviso])
            this.actor.add_child(filho);

        this.actor.connect('notify::hover', () => {
            if (this.actor.hover)
                aoEntrar();
        });
        this.definir(null);
    }

    definir(resumo) {
        this.resumo = resumo;
        const aviso = resumo?.aviso ?? null;
        const musica = resumo?.musica ?? null;
        const tocando = !!musica?.tocando && !aviso;

        // Aviso: a pílula inteira vira o aviso por alguns segundos (o app controla o tempo).
        this._aviso.visible = !!aviso;
        if (aviso) {
            const ponto = `<span foreground="${aviso.cor ?? '#e4e4e7'}">●</span>`;
            const texto = aviso.texto ? `  <span foreground="#a1a1aa">${escapar(aviso.texto)}</span>` : '';
            this._aviso.clutter_text.set_markup(`${ponto}  <b>${escapar(aviso.titulo)}</b>${texto}`);
        }
        this._hora.visible = !aviso;

        // Esquerda: capa tocando; senão, o anel da bateria (some em desktop).
        this._capa.visible = tocando;
        if (tocando) {
            if (musica.capa)
                this._capa.gicon = new Gio.FileIcon({file: Gio.File.new_for_uri(musica.capa)});
            else
                this._capa.icon_name = 'audio-x-generic-symbolic';
        }
        this._anel.definir(!aviso && !tocando ? resumo?.bateria ?? null : null);

        // Direita, nesta ordem: pomodoro, equalizador, uso da IA.
        const foco = !aviso ? resumo?.foco ?? null : null;
        this._foco.visible = !!foco;
        if (foco)
            this._foco.style = `color: ${foco.cor};`;
        this._equalizador.definir(!foco && tocando);
        const ia = !aviso && !foco && !tocando ? resumo?.ia ?? null : null;
        this._ia.visible = !!ia;
        if (ia) {
            this._ia.text = `✦ ${ia.pct}%`;
            this._ia.style = `color: ${ia.cor};`;
        }

        // Periféricos no fim da pílula (quando o usuário escolheu "Pílula" ou "Os dois").
        const perifericos = !aviso ? resumo?.perifericos ?? [] : [];
        this._perifericos.visible = perifericos.length > 0;
        const chave = JSON.stringify(perifericos);
        if (chave !== this._chavePerifericos) {
            this._chavePerifericos = chave;
            this._perifericos.destroy_all_children();
            for (const p of perifericos) {
                const item = new St.BoxLayout({style_class: 'ai-notch-periferico', y_align: Clutter.ActorAlign.CENTER});
                item.add_child(new St.Icon({
                    icon_name: ICONE_TIPO[p.tipo] ?? ICONE_TIPO.outro,
                    icon_size: 14,
                    style: `color: ${p.cor};`,
                    y_align: Clutter.ActorAlign.CENTER,
                }));
                item.add_child(new St.Label({
                    style_class: 'ai-notch-periferico-pct',
                    text: `${p.pct}${p.carregando ? '⚡' : ''}`,
                    style: `color: ${p.cor};`,
                    y_align: Clutter.ActorAlign.CENTER,
                }));
                this._perifericos.add_child(item);
            }
        }
        this.tique();
    }

    /** Uma vez por segundo: relógio e contagem do pomodoro. */
    tique() {
        this._hora.text = GLib.DateTime.new_now_local().format('%H:%M');
        const foco = this.resumo?.foco;
        if (foco && this._foco.visible)
            this._foco.text = mmss(foco.fimEm - Date.now());
    }

    destruir() {
        this._equalizador.destruir();
        this.actor.destroy();
    }
}

export default class AiNotchNaBarra extends Extension {
    enable() {
        this._menuData = Main.panel.statusArea.dateMenu;
        this._relogio = this._menuData._clockDisplay;
        this._pilula = new Pilula(() => {
            if (!this._menuData.menu.isOpen)
                this._proxy?.AbrirAsync().catch(ignorar);
        });
        this._pilula.actor.hide();
        this._relogio.get_parent().insert_child_above(this._pilula.actor, this._relogio);

        // Clicar abre o calendário do GNOME; o notch não pode ficar por cima dele.
        this._menuAberto = this._menuData.menu.connect('open-state-changed', (_menu, aberto) => {
            if (aberto)
                this._proxy?.FecharAsync().catch(ignorar);
        });

        this._vigia = Gio.bus_watch_name(
            Gio.BusType.SESSION,
            NOME,
            Gio.BusNameWatcherFlags.NONE,
            () => this._conectar(),
            () => this._desconectar());
    }

    disable() {
        Gio.bus_unwatch_name(this._vigia);
        this._proxy?.DesconectarAsync().catch(ignorar);
        this._desconectar();
        this._menuData.menu.disconnect(this._menuAberto);
        this._pilula.destruir();
        this._pilula = null;
        this._relogio = null;
        this._menuData = null;
    }

    _conectar() {
        // Construtor com callback = criação assíncrona (não trava o shell).
        const proxy = new ProxyBarra(Gio.DBus.session, NOME, CAMINHO, async (p, erro) => {
            if (erro || this._proxy !== proxy)
                return;
            this._sinal = proxy.connectSignal('EstadoMudou', (_p, _remetente, [json]) => this._aplicar(json));
            try {
                await proxy.ConectarAsync();
                const [json] = await proxy.EstadoAsync();
                this._aplicar(json);
            } catch (e) {
                console.warn(`AI Notch: não consegui conectar ao app (${e.message})`);
                return;
            }
            this._mostrarPilula(true);
        }, null, Gio.DBusProxyFlags.DO_NOT_AUTO_START);
        this._proxy = proxy;
    }

    _desconectar() {
        if (this._proxy && this._sinal)
            this._proxy.disconnectSignal(this._sinal);
        this._proxy = null;
        this._sinal = null;
        this._mostrarPilula(false);
    }

    _aplicar(json) {
        let resumo = null;
        try {
            resumo = json ? JSON.parse(json) : null;
        } catch {
            return;
        }
        this._pilula?.definir(resumo);
    }

    _mostrarPilula(mostrar) {
        if (!this._pilula)
            return;
        this._pilula.actor.visible = mostrar;
        this._relogio.visible = !mostrar;
        if (mostrar && !this._tique) {
            this._tique = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                this._pilula?.tique();
                return GLib.SOURCE_CONTINUE;
            });
        } else if (!mostrar && this._tique) {
            GLib.source_remove(this._tique);
            this._tique = null;
        }
    }
}
