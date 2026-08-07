import { repararTextoUtf8 } from "../texto-utf8";
import VersionPendienteFuente from "./VersionPendienteFuente";
import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import "../liquidaciones-9a4.css";

import {
  analizarVersionLiquidaciones,
  confirmarVersionLiquidaciones,
  probarArchivoSinAplicar,
} from "../api";
import type {
  ResultadoAnalisisLiquidaciones,
  ResultadoConfirmacionLiquidaciones,
} from "../types";

interface Props {
  alActualizar: () =>
    Promise<void> | void;
}

function obtenerMensajeError(
  error: unknown,
): string {
  return error instanceof Error
    ? repararTextoUtf8(error.message)
    : "Ocurrió un error inesperado.";
}

function formatearDuracion(
  segundos: number,
): string {
  return (
    `${String(
      Math.floor(segundos / 60),
    ).padStart(2, "0")}:` +
    String(segundos % 60).padStart(
      2,
      "0",
    )
  );
}

export default function ActualizacionLiquidaciones({
  alActualizar,
}: Props) {
  const [archivo, setArchivo] =
    useState<File | null>(null);
  const [comentario, setComentario] =
    useState("");
  const [analizando, setAnalizando] =
    useState(false);
  const [modoPrueba, setModoPrueba] =
    useState(false);
  const [confirmando, setConfirmando] =
    useState(false);
  const [segundos, setSegundos] =
    useState(0);
  const [mostrarModal, setMostrarModal] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);
  const [mensaje, setMensaje] =
    useState<string | null>(null);
  const [analisis, setAnalisis] =
    useState<ResultadoAnalisisLiquidaciones | null>(
      null,
    );
  const [confirmacion, setConfirmacion] =
    useState<ResultadoConfirmacionLiquidaciones | null>(
      null,
    );
  useEffect(() => {
    if (!confirmando) {
      setSegundos(0);
      return;
    }

    const inicio = Date.now();
    const intervalo =
      window.setInterval(
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
      window.clearInterval(
        intervalo,
      );
  }, [confirmando]);

  function seleccionarArchivo(
    nuevoArchivo: File | null,
  ): void {
    setArchivo(nuevoArchivo);
    setModoPrueba(false);
    setAnalisis(null);
    setConfirmacion(null);
    setError(null);
    setMensaje(null);
  }

  function limpiar(): void {
    seleccionarArchivo(null);
    setComentario("");

    const input =
      document.getElementById(
        "archivo-liquidaciones-independiente",
      ) as HTMLInputElement | null;

    if (input) {
      input.value = "";
    }
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
        "Selecciona el reporte de Liquidaciones.",
      );
      return;
    }

    if (
      !/\.(txt|csv)$/i.test(
        archivo.name,
      )
    ) {
      setError(
        "El archivo debe tener extensión TXT o CSV.",
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
      setModoPrueba(false);

      const resultado =
        await analizarVersionLiquidaciones(
          archivo,
          comentario,
        );

      setAnalisis(resultado);
      setMensaje(
        resultado.puedeConfirmarse
          ? "El reporte es válido y está listo para confirmar."
          : `El análisis encontró ${resultado.totales.errores} fila(s) con error.`,
      );

    } catch (errorAnalisis) {
      setError(
        obtenerMensajeError(
          errorAnalisis,
        ),
      );
    } finally {
      setAnalizando(false);
    }
  }

  async function probarArchivo(): Promise<void> {
    setError(null);
    setMensaje(null);
    setConfirmacion(null);

    if (!archivo) {
      setError("Selecciona el reporte de Liquidaciones.");
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
      setModoPrueba(true);

      const resultado =
        await probarArchivoSinAplicar<ResultadoAnalisisLiquidaciones>(
          "/versiones-liquidaciones/probar",
          "liquidaciones",
          archivo,
        );

      setAnalisis(resultado);
      setMensaje(
        resultado.puedeConfirmarse
          ? "Prueba válida: el archivo cumple las reglas. No se creó ninguna versión ni se modificaron datos."
          : `Prueba completada: se detectaron ${resultado.totales.errores} fila(s) con error. No se modificaron datos.`,
      );
    } catch (errorAnalisis) {
      setError(obtenerMensajeError(errorAnalisis));
    } finally {
      setAnalizando(false);
    }
  }

  function solicitarConfirmacion(): void {
    if (modoPrueba || !analisis?.puedeConfirmarse) {
      return;
    }

    setError(null);
    setMostrarModal(true);
  }

  async function confirmar():
  Promise<void> {
    if (!analisis) {
      return;
    }

    try {
      setMostrarModal(false);
      setConfirmando(true);
      setError(null);
      setMensaje(null);

      const resultado =
        await confirmarVersionLiquidaciones(
          analisis.id,
        );

      setConfirmacion(resultado);
      setMensaje(
        "Las Liquidaciones fueron reemplazadas y conciliadas correctamente.",
      );

      await alActualizar();
    } catch (errorConfirmacion) {
      setError(
        obtenerMensajeError(
          errorConfirmacion,
        ),
      );
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <section className="liquidaciones-actualizacion">
      <VersionPendienteFuente
        fuente="liquidaciones"
        alAplicar={alActualizar}
      />
      <header className="liquidaciones-actualizacion-cabecera">
        <div>
          <h2>
            Actualización independiente de Liquidaciones
          </h2>

          <p>
            Analiza un reporte de Liquidaciones antes de aplicarlo. La
            confirmación reemplaza únicamente Liquidaciones y sus periodos,
            conserva los demás módulos y vuelve a ejecutar su conciliación
            contra los Pagos SisGAT activos.
          </p>
        </div>

        <span className="liquidaciones-flujo-listo">
          Flujo integrado
        </span>
      </header>

      <div className="liquidaciones-impacto">
        <span>Conserva</span>
        <strong>Pagos SisGAT</strong>
        <strong>Órdenes</strong>
        <strong>Requerimientos SisGAT</strong>
        <strong>Requerimientos manuales</strong>
      </div>

      {error && (
        <div className="liquidaciones-mensaje liquidaciones-mensaje-error">
          <strong>Atención</strong>
          <span>{repararTextoUtf8(error)}</span>
        </div>
      )}

      {mensaje && (
        <div className="liquidaciones-mensaje liquidaciones-mensaje-info">
          <strong>
            {confirmacion
              ? "Actualización completada"
              : modoPrueba
                ? "Prueba finalizada"
                : "Análisis finalizado"}
          </strong>
          <span>{repararTextoUtf8(mensaje)}</span>
        </div>
      )}

      <form
        className="liquidaciones-formulario"
        onSubmit={(evento) =>
          void analizar(evento)
        }
      >
        <label className="liquidaciones-selector">
          <input
            id="archivo-liquidaciones-independiente"
            type="file"
            accept=".txt,.csv,text/plain,text/csv"
            onChange={(evento) =>
              seleccionarArchivo(
                evento.target.files?.[0] ??
                  null,
              )
            }
          />

          <span className="liquidaciones-selector-icono">
            ↑
          </span>

          <strong>
            {archivo
              ? archivo.name
              : "Seleccionar Liquidaciones.txt"}
          </strong>

          <small>
            Un archivo TXT o CSV · máximo 25 MB
          </small>
        </label>

        <label className="liquidaciones-comentario">
          <span>
            Comentario de la versión
          </span>

          <textarea
            value={comentario}
            maxLength={500}
            placeholder="Ejemplo: reporte completo de Liquidaciones descargado el 4 de agosto de 2026"
            onChange={(evento) =>
              setComentario(
                evento.target.value,
              )
            }
          />

          <small>
            {comentario.length}/500 caracteres
          </small>
        </label>

        <div className="liquidaciones-acciones">
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
            type="button"
            className="boton-ligero"
            disabled={
              !archivo ||
              analizando ||
              confirmando
            }
            onClick={() => void probarArchivo()}
          >
            {analizando && modoPrueba
              ? "Probando…"
              : "Probar archivo"}
          </button>

          <button
            type="submit"
            className="boton-primario"
            disabled={
              !archivo ||
              analizando ||
              confirmando
            }
          >
            {analizando && !modoPrueba
              ? "Analizando…"
              : "Analizar archivo"}
          </button>
        </div>
      </form>

      {analisis && (
        <section className="liquidaciones-analisis">
          <header>
            <div>
              <span>{modoPrueba ? "Análisis de prueba" : "Versión analizada"}</span>
              <h3>{modoPrueba ? "NO GUARDADA" : analisis.codigo}</h3>
            </div>

            <span
              className={
                analisis.puedeConfirmarse
                  ? "liquidaciones-estado liquidaciones-estado-valido"
                  : "liquidaciones-estado liquidaciones-estado-error"
              }
            >
              {modoPrueba
                ? analisis.puedeConfirmarse
                  ? "Prueba válida"
                  : "Prueba con errores"
                : analisis.puedeConfirmarse
                  ? "Lista para confirmar"
                  : "Contiene errores"}
            </span>
          </header>

          <div className="liquidaciones-analisis-metricas">
            <article>
              <span>Liquidaciones</span>
              <strong>
                {analisis.totales.liquidaciones}
              </strong>
            </article>

            <article>
              <span>Periodos</span>
              <strong>
                {analisis.totales.detalles}
              </strong>
            </article>

            <article>
              <span>Activas</span>
              <strong>
                {analisis.totales.activas}
              </strong>
            </article>

            <article>
              <span>Anuladas</span>
              <strong>
                {analisis.totales.anuladas}
              </strong>
            </article>

            <article>
              <span>Filas válidas</span>
              <strong>
                {analisis.archivo.filasValidas}
              </strong>
            </article>

            <article>
              <span>Errores</span>
              <strong>
                {analisis.totales.errores}
              </strong>
            </article>
          </div>

          {analisis.archivo.errores.length > 0 && (
            <div className="liquidaciones-errores-listado">
              <h4>
                Primeros errores detectados
              </h4>

              {analisis.archivo.errores.map(
                (item, indice) => (
                  <p
                    key={`${item.fila}-${repararTextoUtf8(item.campo)}-${indice}`}
                  >
                    <strong>
                      Fila {item.fila}
                    </strong>
                    {" · "}
                    {repararTextoUtf8(item.campo)}
                    {" · "}
                    {repararTextoUtf8(item.mensaje)}
                  </p>
                ),
              )}
            </div>
          )}

          <div className="liquidaciones-confirmar-acciones">
            <div>
              <span>Archivo</span>
              <strong>
                {analisis.archivo.nombre}
              </strong>
            </div>

            {modoPrueba ? (
              <div className="liquidaciones-mensaje liquidaciones-mensaje-info">
                <strong>Modo de prueba</strong>
                <span>El análisis no creó una versión, no guardó el archivo y no modificó PostgreSQL.</span>
              </div>
            ) : (
              <button
                type="button"
                className="boton-primario"
                disabled={
                  !analisis.puedeConfirmarse ||
                  confirmando
                }
                onClick={solicitarConfirmacion}
              >
                Confirmar versión
              </button>
            )}
          </div>
        </section>
      )}

      {confirmacion && (
        <section className="liquidaciones-confirmacion-resumen">
          <header>
            <div>
              <span>Versión aplicada</span>
              <h3>
                {confirmacion.version.codigo}
              </h3>
            </div>

            <strong>ACTIVA</strong>
          </header>

          <div>
            <article>
              <span>Liquidaciones</span>
              <strong>
                {confirmacion.totales.liquidaciones}
              </strong>
            </article>

            <article>
              <span>Periodos</span>
              <strong>
                {confirmacion.totales.detalles}
              </strong>
            </article>

            <article>
              <span>Contribuyentes</span>
              <strong>
                {confirmacion.totales.contribuyentes}
              </strong>
            </article>

            <article>
              <span>Conciliados</span>
              <strong>
                {confirmacion.conciliacion.liquidacionesProcesadas}
              </strong>
            </article>
          </div>
        </section>
      )}

      {mostrarModal && analisis && (
        <div
          className="liquidaciones-modal-fondo"
          role="presentation"
          onMouseDown={(evento) => {
            if (
              evento.target ===
              evento.currentTarget
            ) {
              setMostrarModal(false);
            }
          }}
        >
          <section
            className="liquidaciones-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-confirmar-liquidaciones"
          >
            <span className="liquidaciones-modal-icono">
              !
            </span>

            <h3 id="titulo-confirmar-liquidaciones">
              Confirmar actualización
            </h3>

            <p>
              Se reemplazarán las {analisis.totales.liquidaciones}{" "}
              Liquidaciones actuales por la versión {analisis.codigo}. Antes
              del cambio se generará un respaldo automático de PostgreSQL.
            </p>

            <div className="liquidaciones-modal-datos">
              <span>
                Liquidaciones
                <strong>
                  {analisis.totales.liquidaciones}
                </strong>
              </span>

              <span>
                Periodos
                <strong>
                  {analisis.totales.detalles}
                </strong>
              </span>
            </div>

            <div className="liquidaciones-modal-acciones">
              <button
                type="button"
                className="boton-ligero"
                onClick={() =>
                  setMostrarModal(false)
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
                Crear respaldo y confirmar
              </button>
            </div>
          </section>
        </div>
      )}

      {confirmando && (
        <div className="liquidaciones-progreso-fondo">
          <section className="liquidaciones-progreso">
            <div className="liquidaciones-progreso-spinner" />

            <h3>
              Aplicando Liquidaciones
            </h3>

            <p>
              El sistema está creando el respaldo, importando los periodos y
              recalculando la conciliación. No cierres esta página.
            </p>

            <strong>
              {formatearDuracion(segundos)}
            </strong>
          </section>
        </div>
      )}
    </section>
  );
}
