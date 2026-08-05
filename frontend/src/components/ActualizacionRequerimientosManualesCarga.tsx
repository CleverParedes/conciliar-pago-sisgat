import { repararTextoUtf8 } from "../texto-utf8";
import VersionPendienteFuente from "./VersionPendienteFuente";
import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import "../requerimientos-manuales-9a6.css";

import {
  analizarVersionRequerimientosManuales,
  confirmarVersionRequerimientosManuales,
  type ResultadoAnalisisVersionRequerimientosManuales,
  type ResultadoConfirmacionVersionRequerimientosManuales,
} from "../requerimientos-manuales-api";

interface Props {
  alActualizar: () => Promise<void> | void;
}

function mensajeError(error: unknown): string {
  return error instanceof Error
    ? repararTextoUtf8(error.message)
    : "Ocurrió un error inesperado.";
}

function claseEstado(estado: string): string {
  const base = "req-manual-version-estado";
  if (estado === "ACTIVA") return `${base} req-manual-version-activa`;
  if (estado === "VALIDADA") return `${base} req-manual-version-validada`;
  if (estado === "FALLIDA") return `${base} req-manual-version-fallida`;
  if (estado === "APLICANDO") return `${base} req-manual-version-aplicando`;
  return `${base} req-manual-version-neutral`;
}

function formatearDuracion(segundos: number): string {
  return `${String(Math.floor(segundos / 60)).padStart(2, "0")}:${String(
    segundos % 60,
  ).padStart(2, "0")}`;
}

function convertirConteos(
  conteos: Record<string, number>,
): Array<[string, number]> {
  return Object.entries(conteos).sort(([a], [b]) => a.localeCompare(b));
}

export default function ActualizacionRequerimientosManualesCarga({
  alActualizar,
}: Props) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [comentario, setComentario] = useState("");
  const [analizando, setAnalizando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analisis, setAnalisis] =
    useState<ResultadoAnalisisVersionRequerimientosManuales | null>(null);
  const [confirmacion, setConfirmacion] =
    useState<ResultadoConfirmacionVersionRequerimientosManuales | null>(null);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [advertenciasRevisadas, setAdvertenciasRevisadas] = useState(false);

  useEffect(() => {
    if (!confirmando) {
      setSegundos(0);
      return;
    }

    const intervalo = window.setInterval(() => {
      setSegundos((actual) => actual + 1);
    }, 1000);

    return () => window.clearInterval(intervalo);
  }, [confirmando]);

  function seleccionarArchivo(nuevo: File | null): void {
    setArchivo(nuevo);
    setAnalisis(null);
    setConfirmacion(null);
    setMensaje(null);
    setError(null);
    setAdvertenciasRevisadas(false);
  }

  function limpiar(): void {
    seleccionarArchivo(null);
    setComentario("");
  }

  async function analizar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();

    if (!archivo) {
      setError("Selecciona el Excel de Requerimientos manuales.");
      return;
    }

    try {
      setAnalizando(true);
      setError(null);
      setMensaje(null);
      setConfirmacion(null);
      setAdvertenciasRevisadas(false);

      const resultado = await analizarVersionRequerimientosManuales(
        archivo,
        comentario,
      );

      setAnalisis(resultado);
      setMensaje(
        resultado.puedeConfirmarse
          ? "El Excel fue validado. Revisa el resumen antes de confirmar."
          : "El Excel contiene errores y no puede confirmarse.",
      );
    } catch (errorAnalisis) {
      setError(mensajeError(errorAnalisis));
    } finally {
      setAnalizando(false);
    }
  }

  async function confirmar(): Promise<void> {
    if (!analisis) return;

    try {
      setMostrarModal(false);
      setConfirmando(true);
      setError(null);
      setMensaje(null);

      const resultado = await confirmarVersionRequerimientosManuales(
        analisis.id,
      );

      setConfirmacion(resultado);
      setMensaje(
        "La versión fue aplicada mediante reemplazo completo y conciliada correctamente.",
      );
      setAnalisis(null);
      setArchivo(null);
      setComentario("");
      setAdvertenciasRevisadas(false);
      await alActualizar();
    } catch (errorConfirmacion) {
      setError(mensajeError(errorConfirmacion));
    } finally {
      setConfirmando(false);
    }
  }

  const tieneAdvertencias = (analisis?.totales.advertencias ?? 0) > 0;
  const puedeAbrirConfirmacion = Boolean(
    analisis?.puedeConfirmarse &&
      (!tieneAdvertencias || advertenciasRevisadas),
  );

  return (
    <section className="req-manual-carga">
      <VersionPendienteFuente
        fuente="requerimientos-manuales"
        alAplicar={alActualizar}
      />
      <header className="req-manual-carga-cabecera">
        <div>
          <h2>Actualización independiente de Requerimientos manuales</h2>
          <p>
            Importa el Excel operativo completo. El sistema detecta el año,
            crea un respaldo y reemplaza todos los Requerimientos manuales
            anteriores antes de conciliar la nueva versión.
          </p>
        </div>
        <span className="req-manual-carga-insignia">Excel · reemplazo completo</span>
      </header>

      <aside className="req-manual-carga-seguridad">
        <strong>El nuevo Excel reemplaza completamente al anterior</strong>
        <p>
          Antes de confirmar se crea un respaldo completo. Luego se eliminan los
          requerimientos manuales actuales, sus periodos, seguimientos e historial
          operativo, y se importa la nueva versión desde cero.
        </p>
      </aside>

      {error && <div className="req-manual-alerta req-manual-alerta-error">{repararTextoUtf8(error)}</div>}
      {mensaje && (
        <div className="req-manual-alerta req-manual-alerta-correcta">
          <strong>{confirmacion ? "Actualización completada" : "Análisis finalizado"}</strong>
          <span>{repararTextoUtf8(mensaje)}</span>
        </div>
      )}

      <form className="req-manual-formulario" onSubmit={(evento) => void analizar(evento)}>
        <label className="req-manual-selector">
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(evento) => seleccionarArchivo(evento.target.files?.[0] ?? null)}
          />
          <span className="req-manual-selector-icono">↑</span>
          <strong>{archivo ? archivo.name : "Seleccionar Requerimientos_Manuales.xlsx"}</strong>
          <small>Archivo Excel .xlsx · máximo 30 MB</small>
        </label>

        <div className="req-manual-formulario-campos">
          <label>
            <span>Comentario de la versión</span>
            <textarea
              value={comentario}
              maxLength={500}
              placeholder="Ejemplo: actualización operativa de agosto de 2026"
              onChange={(evento) => setComentario(evento.target.value)}
            />
            <small>{comentario.length}/500 caracteres</small>
          </label>
        </div>

        <div className="req-manual-formulario-acciones">
          <button type="button" className="boton-ligero" disabled={analizando || confirmando} onClick={limpiar}>
            Limpiar
          </button>
          <button type="submit" className="boton-primario" disabled={!archivo || analizando || confirmando}>
            {analizando ? "Analizando…" : "Analizar Excel"}
          </button>
        </div>
      </form>

      {analisis && (
        <section className="req-manual-analisis">
          <header>
            <div>
              <span>Resultado del análisis</span>
              <h3>{analisis.codigo}</h3>
              <small>Año detectado automáticamente: {analisis.anioGestion}</small>
            </div>
            <span className={claseEstado(analisis.estado)}>{analisis.estado}</span>
          </header>

          <div className="req-manual-metricas">
            <article><span>Registros</span><strong>{analisis.totales.registros}</strong></article>
            <article><span>Periodos</span><strong>{analisis.totales.periodos}</strong></article>
            <article><span>Placas utilizables</span><strong>{analisis.totales.placasNormalizables}</strong></article>
            <article><span>Advertencias</span><strong>{analisis.totales.advertencias}</strong></article>
            <article><span>Filas válidas</span><strong>{analisis.archivo.filasValidas}</strong></article>
            <article><span>Errores</span><strong>{analisis.totales.errores}</strong></article>
          </div>

          <div className="req-manual-clasificacion">
            <article>
              <h4>Clasificación de registros</h4>
              {convertirConteos(analisis.clasificacion.porTipoRegistro).map(([estado, cantidad]) => (
                <p key={estado}><span>{estado.replaceAll("_", " ")}</span><strong>{cantidad}</strong></p>
              ))}
            </article>
            <article>
              <h4>Estado escrito en Excel</h4>
              {convertirConteos(analisis.clasificacion.porEstadoManual).map(([estado, cantidad]) => (
                <p key={estado}><span>{estado.replaceAll("_", " ")}</span><strong>{cantidad}</strong></p>
              ))}
            </article>
          </div>

          {analisis.archivo.advertencias.length > 0 && (
            <div className="req-manual-incidencias req-manual-incidencias-advertencia">
              <h4>Advertencias del Excel</h4>
              {analisis.archivo.advertencias.map((item, indice) => (
                <p key={`${item.fila}-${repararTextoUtf8(item.campo)}-${indice}`}>
                  <strong>Fila {item.fila}</strong>{" · "}{repararTextoUtf8(item.campo)}{" · "}{repararTextoUtf8(item.mensaje)}
                </p>
              ))}
              <label className="req-manual-revision-check">
                <input
                  type="checkbox"
                  checked={advertenciasRevisadas}
                  onChange={(evento) => setAdvertenciasRevisadas(evento.target.checked)}
                />
                <span>He revisado las advertencias y acepto los ajustes detectados.</span>
              </label>
            </div>
          )}

          {analisis.archivo.errores.length > 0 && (
            <div className="req-manual-incidencias req-manual-incidencias-error">
              <h4>Primeros errores detectados</h4>
              {analisis.archivo.errores.map((item, indice) => (
                <p key={`${item.fila}-${repararTextoUtf8(item.campo)}-${indice}`}>
                  <strong>Fila {item.fila}</strong>{" · "}{repararTextoUtf8(item.campo)}{" · "}{repararTextoUtf8(item.mensaje)}
                </p>
              ))}
            </div>
          )}

          <div className="req-manual-confirmar-acciones">
            <div>
              <span>Archivo y hoja</span>
              <strong>{analisis.archivo.nombre}</strong>
              <small>{analisis.archivo.hoja}</small>
            </div>
            <button
              type="button"
              className="boton-primario"
              disabled={!puedeAbrirConfirmacion || confirmando}
              onClick={() => setMostrarModal(true)}
            >
              Confirmar versión
            </button>
          </div>
        </section>
      )}

      {confirmacion && (
        <section className="req-manual-confirmacion-resumen">
          <header>
            <div>
              <span>Versión aplicada</span>
              <h3>{confirmacion.version.codigo}</h3>
            </div>
            <strong>ACTIVA</strong>
          </header>
          <div>
            <article><span>Registros anteriores eliminados</span><strong>{confirmacion.reemplazo.registrosEliminados}</strong></article>
            <article><span>Registros nuevos</span><strong>{confirmacion.totales.registros}</strong></article>
            <article><span>Periodos nuevos</span><strong>{confirmacion.totales.periodos}</strong></article>
            <article><span>Seguimientos anteriores eliminados</span><strong>{confirmacion.reemplazo.seguimientosEliminados}</strong></article>
            <article><span>Historial anterior eliminado</span><strong>{confirmacion.reemplazo.historialEliminado}</strong></article>
            <article><span>Conciliados</span><strong>{confirmacion.conciliacion.requerimientosProcesados}</strong></article>
          </div>
        </section>
      )}

      {mostrarModal && analisis && (
        <div className="req-manual-modal-fondo" role="presentation" onMouseDown={(evento) => {
          if (evento.target === evento.currentTarget) setMostrarModal(false);
        }}>
          <section className="req-manual-modal" role="dialog" aria-modal="true" aria-labelledby="titulo-confirmar-manuales">
            <span className="req-manual-modal-icono">!</span>
            <h3 id="titulo-confirmar-manuales">Confirmar reemplazo completo</h3>
            <p>
              Se importarán {analisis.totales.registros} registros del año detectado {analisis.anioGestion}.
              Antes del cambio se creará un respaldo completo de PostgreSQL.
            </p>
            <div className="req-manual-modal-reglas">
              <span><strong>Se elimina</strong>Requerimientos actuales, periodos, seguimientos e historial operativo</span>
              <span><strong>Se importa</strong>Todo el contenido válido del nuevo Excel</span>
              <span><strong>Se conserva</strong>El historial de versiones y el respaldo generado</span>
            </div>
            <div className="req-manual-modal-acciones">
              <button type="button" className="boton-ligero" onClick={() => setMostrarModal(false)}>Cancelar</button>
              <button type="button" className="boton-primario" onClick={() => void confirmar()}>Crear respaldo y confirmar</button>
            </div>
          </section>
        </div>
      )}

      {confirmando && (
        <div className="req-manual-progreso-fondo">
          <section className="req-manual-progreso">
            <div className="req-manual-progreso-spinner" />
            <h3>Aplicando Requerimientos manuales</h3>
            <p>
              El sistema está creando el respaldo, eliminando la versión activa,
              importando el nuevo Excel y recalculando la conciliación.
              No cierres esta página.
            </p>
            <strong>{formatearDuracion(segundos)}</strong>
          </section>
        </div>
      )}
    </section>
  );
}
