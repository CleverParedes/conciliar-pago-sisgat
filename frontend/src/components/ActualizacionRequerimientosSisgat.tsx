import { repararTextoUtf8 } from "../texto-utf8";
import VersionPendienteFuente from "./VersionPendienteFuente";
import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import "../requerimientos-sisgat-9a5.css";

import {
  analizarVersionRequerimientosSisgat,
  confirmarVersionRequerimientosSisgat,
} from "../api";
import type {
  ResultadoAnalisisRequerimientosSisgat,
  ResultadoConfirmacionRequerimientosSisgat,
} from "../types";

interface Props {
  alActualizar: () => Promise<void> | void;
}

function mensajeError(error: unknown): string {
  return error instanceof Error
    ? repararTextoUtf8(error.message)
    : "Ocurrió un error inesperado.";
}

function claseEstado(estado: string): string {
  if (estado === "ACTIVA") {
    return "requerimientos-sisgat-version-estado requerimientos-sisgat-version-activa";
  }
  if (estado === "VALIDADA") {
    return "requerimientos-sisgat-version-estado requerimientos-sisgat-version-validada";
  }
  if (estado === "FALLIDA") {
    return "requerimientos-sisgat-version-estado requerimientos-sisgat-version-fallida";
  }
  if (estado === "APLICANDO") {
    return "requerimientos-sisgat-version-estado requerimientos-sisgat-version-aplicando";
  }
  return "requerimientos-sisgat-version-estado requerimientos-sisgat-version-neutral";
}

function formatearDuracion(segundos: number): string {
  return `${String(Math.floor(segundos / 60)).padStart(2, "0")}:${String(
    segundos % 60,
  ).padStart(2, "0")}`;
}

export default function ActualizacionRequerimientosSisgat({
  alActualizar,
}: Props) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [comentario, setComentario] = useState("");
  const [analizando, setAnalizando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [analisis, setAnalisis] =
    useState<ResultadoAnalisisRequerimientosSisgat | null>(null);
  const [confirmacion, setConfirmacion] =
    useState<ResultadoConfirmacionRequerimientosSisgat | null>(null);
  useEffect(() => {
    if (!confirmando) {
      setSegundos(0);
      return;
    }

    const inicio = Date.now();
    const intervalo = window.setInterval(() => {
      setSegundos(Math.floor((Date.now() - inicio) / 1000));
    }, 1000);

    return () => window.clearInterval(intervalo);
  }, [confirmando]);

  function seleccionarArchivo(nuevo: File | null): void {
    setArchivo(nuevo);
    setAnalisis(null);
    setConfirmacion(null);
    setError(null);
    setMensaje(null);
  }

  function limpiar(): void {
    seleccionarArchivo(null);
    setComentario("");
    const input = document.getElementById(
      "archivo-requerimientos-sisgat-independiente",
    ) as HTMLInputElement | null;
    if (input) input.value = "";
  }

  async function analizar(evento: FormEvent): Promise<void> {
    evento.preventDefault();
    setError(null);
    setMensaje(null);
    setConfirmacion(null);

    if (!archivo) {
      setError("Selecciona el reporte de Requerimientos SisGAT.");
      return;
    }
    if (!/\.(txt|csv)$/i.test(archivo.name)) {
      setError("El archivo debe tener extensión TXT o CSV.");
      return;
    }
    if (archivo.size > 25 * 1024 * 1024) {
      setError("El archivo supera el límite de 25 MB.");
      return;
    }

    try {
      setAnalizando(true);
      const resultado = await analizarVersionRequerimientosSisgat(
        archivo,
        comentario,
      );
      setAnalisis(resultado);
      setMensaje(
        resultado.puedeConfirmarse
          ? "El reporte es válido y está listo para confirmar."
          : `El análisis encontró ${resultado.totales.errores} fila(s) con error.`,
      );
    } catch (e) {
      setError(mensajeError(e));
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
      const resultado = await confirmarVersionRequerimientosSisgat(
        analisis.id,
      );
      setConfirmacion(resultado);
      setMensaje(
        "Los Requerimientos SisGAT fueron reemplazados y conciliados correctamente.",
      );
      await alActualizar();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <section className="requerimientos-sisgat-actualizacion">
      <VersionPendienteFuente
        fuente="requerimientos-sisgat"
        alAplicar={alActualizar}
      />
      <header className="requerimientos-sisgat-actualizacion-cabecera">
        <div>
          <h2>Actualización independiente de Requerimientos SisGAT</h2>
          <p>
            Analiza el reporte oficial antes de aplicarlo. La confirmación
            reemplaza únicamente los Requerimientos SisGAT y sus periodos,
            conserva los demás módulos y ejecuta nuevamente su conciliación
            contra los Pagos SisGAT activos.
          </p>
        </div>
        <span className="requerimientos-sisgat-flujo-listo">
          Flujo integrado
        </span>
      </header>

      <div className="requerimientos-sisgat-impacto">
        <span>Conserva</span>
        <strong>Pagos SisGAT</strong>
        <strong>Órdenes</strong>
        <strong>Liquidaciones</strong>
        <strong>Requerimientos manuales</strong>
      </div>

      {error && (
        <div className="requerimientos-sisgat-mensaje requerimientos-sisgat-mensaje-error">
          <strong>Atención</strong>
          <span>{repararTextoUtf8(error)}</span>
        </div>
      )}

      {mensaje && (
        <div className="requerimientos-sisgat-mensaje requerimientos-sisgat-mensaje-info">
          <strong>
            {confirmacion ? "Actualización completada" : "Análisis finalizado"}
          </strong>
          <span>{repararTextoUtf8(mensaje)}</span>
        </div>
      )}

      <form
        className="requerimientos-sisgat-formulario"
        onSubmit={(evento) => void analizar(evento)}
      >
        <label className="requerimientos-sisgat-selector">
          <input
            id="archivo-requerimientos-sisgat-independiente"
            type="file"
            accept=".txt,.csv,text/plain,text/csv"
            onChange={(evento) =>
              seleccionarArchivo(evento.target.files?.[0] ?? null)
            }
          />
          <span className="requerimientos-sisgat-selector-icono">↑</span>
          <strong>
            {archivo ? archivo.name : "Seleccionar Requerimientos SisGAT.txt"}
          </strong>
          <small>Un archivo TXT o CSV · máximo 25 MB</small>
        </label>

        <label className="requerimientos-sisgat-comentario">
          <span>Comentario de la versión</span>
          <textarea
            value={comentario}
            maxLength={500}
            placeholder="Ejemplo: reporte oficial actualizado de agosto de 2026"
            onChange={(evento) => setComentario(evento.target.value)}
          />
          <small>{comentario.length}/500 caracteres</small>
        </label>

        <div className="requerimientos-sisgat-formulario-acciones">
          <button
            type="button"
            className="boton-ligero"
            disabled={analizando || confirmando}
            onClick={limpiar}
          >
            Limpiar
          </button>
          <button
            type="submit"
            className="boton-primario"
            disabled={!archivo || analizando || confirmando}
          >
            {analizando ? "Analizando…" : "Analizar archivo"}
          </button>
        </div>
      </form>

      {analisis && (
        <section className="requerimientos-sisgat-analisis">
          <header>
            <div>
              <span>Resultado del análisis</span>
              <h3>{analisis.codigo}</h3>
            </div>
            <span className={claseEstado(analisis.estado)}>
              {analisis.estado}
            </span>
          </header>

          <div className="requerimientos-sisgat-metricas">
            <article><span>Requerimientos</span><strong>{analisis.totales.requerimientos}</strong></article>
            <article><span>Periodos</span><strong>{analisis.totales.detalles}</strong></article>
            <article><span>Activos</span><strong>{analisis.totales.activos}</strong></article>
            <article><span>Anulados</span><strong>{analisis.totales.anulados}</strong></article>
            <article><span>Filas válidas</span><strong>{analisis.archivo.filasValidas}</strong></article>
            <article><span>Errores</span><strong>{analisis.totales.errores}</strong></article>
          </div>

          {analisis.archivo.advertencias.length > 0 && (
            <div className="requerimientos-sisgat-advertencias-listado">
              <h4>Advertencias informativas</h4>
              {analisis.archivo.advertencias.map((item, indice) => (
                <p key={`${item.fila}-${item.tipo}-${indice}`}>
                  <strong>Fila {item.fila}</strong>{" · "}{item.tipo}{" · "}{repararTextoUtf8(item.mensaje)}
                </p>
              ))}
            </div>
          )}

          {analisis.archivo.errores.length > 0 && (
            <div className="requerimientos-sisgat-errores-listado">
              <h4>Primeros errores detectados</h4>
              {analisis.archivo.errores.map((item, indice) => (
                <p key={`${item.fila}-${repararTextoUtf8(item.campo)}-${indice}`}>
                  <strong>Fila {item.fila}</strong>{" · "}{repararTextoUtf8(item.campo)}{" · "}{repararTextoUtf8(item.mensaje)}
                </p>
              ))}
            </div>
          )}

          <div className="requerimientos-sisgat-confirmar-acciones">
            <div>
              <span>Archivo</span>
              <strong>{analisis.archivo.nombre}</strong>
            </div>
            <button
              type="button"
              className="boton-primario"
              disabled={!analisis.puedeConfirmarse || confirmando}
              onClick={() => setMostrarModal(true)}
            >
              Confirmar versión
            </button>
          </div>
        </section>
      )}

      {confirmacion && (
        <section className="requerimientos-sisgat-confirmacion-resumen">
          <header>
            <div>
              <span>Versión aplicada</span>
              <h3>{confirmacion.version.codigo}</h3>
            </div>
            <strong>ACTIVA</strong>
          </header>
          <div>
            <article><span>Requerimientos</span><strong>{confirmacion.totales.requerimientos}</strong></article>
            <article><span>Periodos</span><strong>{confirmacion.totales.detalles}</strong></article>
            <article><span>Contribuyentes</span><strong>{confirmacion.totales.contribuyentes}</strong></article>
            <article><span>Conciliados</span><strong>{confirmacion.conciliacion.requerimientosProcesadas}</strong></article>
          </div>
        </section>
      )}

      {mostrarModal && analisis && (
        <div
          className="requerimientos-sisgat-modal-fondo"
          role="presentation"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) setMostrarModal(false);
          }}
        >
          <section
            className="requerimientos-sisgat-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-confirmar-requerimientos-sisgat"
          >
            <span className="requerimientos-sisgat-modal-icono">!</span>
            <h3 id="titulo-confirmar-requerimientos-sisgat">Confirmar actualización</h3>
            <p>
              Se reemplazarán los {analisis.totales.requerimientos} Requerimientos
              SisGAT actuales por la versión {analisis.codigo}. Antes del cambio se
              generará un respaldo automático completo de PostgreSQL.
            </p>
            <div className="requerimientos-sisgat-modal-datos">
              <span>Requerimientos<strong>{analisis.totales.requerimientos}</strong></span>
              <span>Periodos<strong>{analisis.totales.detalles}</strong></span>
            </div>
            <div className="requerimientos-sisgat-modal-acciones">
              <button type="button" className="boton-ligero" onClick={() => setMostrarModal(false)}>Cancelar</button>
              <button type="button" className="boton-primario" onClick={() => void confirmar()}>Crear respaldo y confirmar</button>
            </div>
          </section>
        </div>
      )}

      {confirmando && (
        <div className="requerimientos-sisgat-progreso-fondo">
          <section className="requerimientos-sisgat-progreso">
            <div className="requerimientos-sisgat-progreso-spinner" />
            <h3>Aplicando Requerimientos SisGAT</h3>
            <p>
              El sistema está creando el respaldo, importando los periodos y
              recalculando la conciliación. No cierres esta página.
            </p>
            <strong>{formatearDuracion(segundos)}</strong>
          </section>
        </div>
      )}
    </section>
  );
}
