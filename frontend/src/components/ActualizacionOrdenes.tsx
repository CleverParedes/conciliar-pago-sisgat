import { repararTextoUtf8 } from "../texto-utf8";
import VersionPendienteFuente from "./VersionPendienteFuente";
import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import "../ordenes-9a3.css";

import {
  analizarVersionOrdenes,
  confirmarVersionOrdenes,
} from "../api";
import type {
  ResultadoAnalisisOrdenes,
  ResultadoConfirmacionOrdenes,
} from "../types";

interface Props {
  alActualizar: () =>
    Promise<void> | void;
}

function mensajeError(
  error: unknown,
): string {
  return error instanceof Error
    ? repararTextoUtf8(error.message)
    : "Ocurrió un error inesperado.";
}

function duracion(
  segundos: number,
): string {
  return (
    `${String(
      Math.floor(segundos / 60),
    ).padStart(2, "0")}:` +
    String(segundos % 60)
      .padStart(2, "0")
  );
}

export default function ActualizacionOrdenes({
  alActualizar,
}: Props) {
  const [archivo, setArchivo] =
    useState<File | null>(null);
  const [comentario, setComentario] =
    useState("");
  const [analizando, setAnalizando] =
    useState(false);
  const [confirmando, setConfirmando] =
    useState(false);
  const [segundos, setSegundos] =
    useState(0);
  const [modal, setModal] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);
  const [mensaje, setMensaje] =
    useState<string | null>(null);
  const [analisis, setAnalisis] =
    useState<ResultadoAnalisisOrdenes | null>(
      null,
    );
  const [confirmacion, setConfirmacion] =
    useState<ResultadoConfirmacionOrdenes | null>(
      null,
    );

  useEffect(() => {
    if (!confirmando) {
      setSegundos(0);
      return;
    }

    const inicio = Date.now();
    const id = window.setInterval(
      () => {
        setSegundos(
          Math.floor(
            (Date.now() - inicio) /
              1000,
          ),
        );
      },
      1000,
    );

    return () =>
      window.clearInterval(id);
  }, [confirmando]);

  function seleccionar(
    nuevo: File | null,
  ): void {
    setArchivo(nuevo);
    setAnalisis(null);
    setConfirmacion(null);
    setError(null);
    setMensaje(null);
  }

  async function analizar(
    evento: FormEvent,
  ): Promise<void> {
    evento.preventDefault();
    setError(null);
    setMensaje(null);
    setConfirmacion(null);

    if (!archivo) {
      setError(
        "Selecciona el reporte de órdenes de pago.",
      );
      return;
    }

    if (
      !/\.(txt|csv)$/i.test(
        archivo.name,
      )
    ) {
      setError(
        "El archivo debe ser TXT o CSV.",
      );
      return;
    }

    if (
      archivo.size >
      25 * 1024 * 1024
    ) {
      setError(
        "El archivo supera el límite de 25 MB.",
      );
      return;
    }

    try {
      setAnalizando(true);

      const resultado =
        await analizarVersionOrdenes(
          archivo,
          comentario,
        );

      setAnalisis(resultado);
      setMensaje(
        resultado.puedeConfirmarse
          ? "El archivo es válido y está listo para confirmar."
          : "El archivo contiene errores y no puede aplicarse.",
      );
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setAnalizando(false);
    }
  }

  function solicitarConfirmacion(): void {
    if (
      !analisis?.puedeConfirmarse
    ) {
      return;
    }

    setError(null);
    setModal(true);
  }

  async function confirmar():
  Promise<void> {
    if (!analisis) {
      return;
    }

    try {
      setModal(false);
      setConfirmando(true);
      setError(null);
      setMensaje(null);

      const resultado =
        await confirmarVersionOrdenes(
          analisis.id,
        );

      setConfirmacion(resultado);
      setMensaje(
        "Las órdenes fueron actualizadas y conciliadas contra los pagos SisGAT activos.",
      );

      await alActualizar();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setConfirmando(false);
    }
  }

  function limpiar(): void {
    seleccionar(null);
    setComentario("");

    const input =
      document.getElementById(
        "archivo-ordenes-independiente",
      ) as HTMLInputElement | null;

    if (input) {
      input.value = "";
    }
  }

  return (
    <section className="ordenes-independientes">
      <VersionPendienteFuente
        fuente="ordenes"
        alAplicar={alActualizar}
      />
      <header className="ordenes-independientes-cabecera">
        <div>
          <h2>
            Actualización independiente de Órdenes
          </h2>

          <p>
            Reemplaza únicamente las órdenes y sus periodos. Las declaraciones,
            recibos, liquidaciones y requerimientos se conservan.
          </p>
        </div>

        <span className="ordenes-independientes-listo">
          Flujo independiente
        </span>
      </header>

      <div className="ordenes-impacto">
        <span>Conserva</span>
        <strong>Pagos SisGAT</strong>
        <strong>Liquidaciones</strong>
        <strong>Requerimientos SisGAT</strong>
        <strong>Requerimientos manuales</strong>
      </div>

      {error && (
        <div className="ordenes-mensaje ordenes-mensaje-error">
          <strong>Atención</strong>
          <span>{repararTextoUtf8(error)}</span>
        </div>
      )}

      {mensaje && (
        <div className="ordenes-mensaje ordenes-mensaje-info">
          <strong>
            {confirmacion
              ? "Actualización completada"
              : "Análisis finalizado"}
          </strong>
          <span>{repararTextoUtf8(mensaje)}</span>
        </div>
      )}

      <form
        className="ordenes-independientes-formulario"
        onSubmit={(evento) =>
          void analizar(evento)
        }
      >
        <label className="ordenes-selector">
          <input
            id="archivo-ordenes-independiente"
            type="file"
            accept=".txt,.csv,text/plain,text/csv"
            onChange={(evento) =>
              seleccionar(
                evento.target
                  .files?.[0] ??
                  null,
              )
            }
          />

          <span className="ordenes-selector-icono">
            ↑
          </span>

          <strong>
            {archivo
              ? archivo.name
              : "Seleccionar reporte de órdenes"}
          </strong>

          <small>
            Un solo archivo TXT o CSV · máximo 25 MB
          </small>
        </label>

        <label className="ordenes-comentario">
          <span>Comentario de la versión</span>

          <textarea
            value={comentario}
            maxLength={500}
            placeholder="Ejemplo: reporte completo de órdenes descargado el 4 de agosto de 2026"
            onChange={(evento) =>
              setComentario(
                evento.target.value,
              )
            }
          />
        </label>

        <div className="ordenes-acciones">
          <button
            type="button"
            className="boton-ligero"
            onClick={limpiar}
            disabled={
              analizando ||
              confirmando
            }
          >
            Limpiar
          </button>

          <button
            type="submit"
            className="boton-primario"
            disabled={
              analizando ||
              confirmando ||
              !archivo
            }
          >
            {analizando
              ? "Analizando…"
              : "Analizar archivo"}
          </button>
        </div>
      </form>

      {analisis && (
        <section className="ordenes-analisis">
          <header>
            <div>
              <span>Versión analizada</span>
              <h3>#{analisis.id}</h3>
            </div>

            <span
              className={
                analisis.puedeConfirmarse
                  ? "ordenes-estado ordenes-estado-valido"
                  : "ordenes-estado ordenes-estado-error"
              }
            >
              {analisis.puedeConfirmarse
                ? "Lista para confirmar"
                : "Con errores"}
            </span>
          </header>

          <div className="ordenes-analisis-metricas">
            <div>
              <span>Órdenes</span>
              <strong>
                {analisis.totales.ordenes}
              </strong>
            </div>

            <div>
              <span>Periodos</span>
              <strong>
                {analisis.totales.detalles}
              </strong>
            </div>

            <div>
              <span>Filas válidas</span>
              <strong>
                {analisis.archivo.filasValidas}
              </strong>
            </div>

            <div>
              <span>Errores</span>
              <strong>
                {analisis.totales.errores}
              </strong>
            </div>
          </div>

          {analisis.archivo.errores.length > 0 && (
            <div className="ordenes-listado-revision">
              <h4>Primeros errores</h4>

              {analisis.archivo.errores
                .slice(0, 10)
                .map((item, indice) => (
                  <p key={`${item.fila}-${indice}`}>
                    Fila {item.fila}: {repararTextoUtf8(item.mensaje)}
                  </p>
                ))}
            </div>
          )}

          <button
            type="button"
            className="boton-primario"
            disabled={
              !analisis.puedeConfirmarse ||
              confirmando
            }
            onClick={
              solicitarConfirmacion
            }
          >
            Confirmar nueva versión de órdenes
          </button>
        </section>
      )}

      {confirmacion && (
        <section className="ordenes-confirmacion-resumen">
          <header>
            <div>
              <span>Nueva versión activa</span>
              <h3>#{confirmacion.version.id}</h3>
            </div>

            <strong>Actualización correcta</strong>
          </header>

          <div>
            <article>
              <span>Órdenes</span>
              <strong>
                {confirmacion.totales.ordenes}
              </strong>
            </article>

            <article>
              <span>Periodos</span>
              <strong>
                {confirmacion.totales.detalles}
              </strong>
            </article>

            <article>
              <span>Declaraciones conservadas</span>
              <strong>
                {confirmacion.modulosConservados.declaraciones}
              </strong>
            </article>

            <article>
              <span>Recibos conservados</span>
              <strong>
                {confirmacion.modulosConservados.recibos}
              </strong>
            </article>

            <article>
              <span>Liquidaciones conservadas</span>
              <strong>
                {confirmacion.modulosConservados.liquidaciones}
              </strong>
            </article>

            <article>
              <span>Requerimientos conservados</span>
              <strong>
                {confirmacion.modulosConservados.requerimientosSisgat +
                  confirmacion.modulosConservados.requerimientosManuales}
              </strong>
            </article>
          </div>
        </section>
      )}

      {modal && analisis && (
        <div className="modal-actualizacion-fondo">
          <section className="modal-confirmar-actualizacion">
            <div className="modal-confirmar-icono">
              ↻
            </div>

            <div className="modal-confirmar-contenido">
              <p className="pagina-etiqueta">
                Confirmación final
              </p>

              <h2>
                Aplicar versión de órdenes #{analisis.id}
              </h2>

              <p>
                Se creará un respaldo completo. Después se reemplazarán
                únicamente las órdenes y sus periodos.
              </p>

              <dl className="modal-confirmar-resumen">
                <div>
                  <dt>Órdenes</dt>
                  <dd>{analisis.totales.ordenes}</dd>
                </div>

                <div>
                  <dt>Periodos</dt>
                  <dd>{analisis.totales.detalles}</dd>
                </div>

                <div>
                  <dt>Pagos eliminados</dt>
                  <dd>0</dd>
                </div>

                <div>
                  <dt>Módulos conservados</dt>
                  <dd>4</dd>
                </div>
              </dl>

              <div className="modal-confirmar-aviso">
                Mantén la pestaña abierta mientras se importa y concilia
                la nueva versión.
              </div>

              <div className="modal-confirmar-acciones">
                <button
                  type="button"
                  className="boton-ligero"
                  onClick={() =>
                    setModal(false)
                  }
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  className="boton-primario"
                  onClick={() =>
                    void confirmar()
                  }
                >
                  Confirmar y conciliar
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {confirmando && (
        <div className="modal-actualizacion-fondo modal-actualizacion-bloqueado">
          <section className="modal-progreso-actualizacion">
            <div className="progreso-actualizacion-cabecera">
              <span className="progreso-actualizacion-spinner" />

              <div>
                <p className="pagina-etiqueta">
                  Proceso en curso
                </p>

                <h2>Actualizando Órdenes</h2>
              </div>
            </div>

            <p>
              Respaldo, importación y conciliación de órdenes.
            </p>

            <div className="barra-progreso-actualizacion">
              <span />
            </div>

            <ol className="etapas-progreso-actualizacion">
              <li>
                <span>1</span>
                <div>
                  <strong>Respaldo</strong>
                  <small>Protege PostgreSQL.</small>
                </div>
              </li>

              <li>
                <span>2</span>
                <div>
                  <strong>Órdenes</strong>
                  <small>Reemplaza órdenes y periodos.</small>
                </div>
              </li>

              <li>
                <span>3</span>
                <div>
                  <strong>Conciliación</strong>
                  <small>Compara con los pagos activos.</small>
                </div>
              </li>
            </ol>

            <strong className="tiempo-proceso-actualizacion">
              Tiempo transcurrido: {duracion(segundos)}
            </strong>
          </section>
        </div>
      )}
    </section>
  );
}
