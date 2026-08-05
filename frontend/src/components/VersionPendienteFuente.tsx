import {
  useCallback,
  useEffect,
  useState,
} from "react";

import "../versiones-pendientes.css";

import AjustesAutomaticosDetalle from "./AjustesAutomaticosDetalle";
import {
  confirmarVersionPendiente,
  descartarVersionPendiente,
  obtenerVersionesCanceladas,
  obtenerVersionesPendientes,
  reabrirVersionCancelada,
  type FuenteVersionPendiente,
  type VersionPendiente,
} from "../versiones-pendientes-api";
import {
  repararTextoUtf8,
} from "../texto-utf8";

interface Props {
  fuente:
    FuenteVersionPendiente;
  alAplicar: () =>
    Promise<void> | void;
}

function mensajeError(
  error: unknown,
): string {
  return error instanceof Error
    ? repararTextoUtf8(
        error.message,
      )
    : "Ocurrió un error inesperado.";
}

function formatearFecha(
  valor: string,
): string {
  const fecha = new Date(valor);

  if (
    Number.isNaN(
      fecha.getTime(),
    )
  ) {
    return "Fecha no válida";
  }

  return new Intl.DateTimeFormat(
    "es-PE",
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone:
        "America/Lima",
    },
  ).format(fecha);
}

function formatearTamano(
  bytes: number,
): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;

  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  return `${(
    kb / 1024
  ).toFixed(1)} MB`;
}

export default function VersionPendienteFuente({
  fuente,
  alAplicar,
}: Props) {
  const [
    versiones,
    setVersiones,
  ] = useState<
    VersionPendiente[]
  >([]);

  const [
    canceladas,
    setCanceladas,
  ] = useState<
    VersionPendiente[]
  >([]);

  const [
    cargando,
    setCargando,
  ] = useState(true);

  const [
    procesandoId,
    setProcesandoId,
  ] = useState<
    number | null
  >(null);

  const [
    expandidaId,
    setExpandidaId,
  ] = useState<
    number | null
  >(null);

  const [
    aceptadas,
    setAceptadas,
  ] = useState<
    Record<number, boolean>
  >({});

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(null);

  const cargar =
    useCallback(
      async () => {
        try {
          setCargando(true);
          setError(null);

          const [
            pendientes,
            versionesCanceladas,
          ] =
            await Promise.all([
              obtenerVersionesPendientes(
                fuente,
              ),
              obtenerVersionesCanceladas(
                fuente,
              ),
            ]);

          setVersiones(
            pendientes,
          );

          setCanceladas(
            versionesCanceladas,
          );

          setExpandidaId(
            (actual) =>
              actual !== null &&
              pendientes.some(
                (version) =>
                  version.id ===
                  actual,
              )
                ? actual
                : null,
          );
        } catch (
          errorCarga
        ) {
          setError(
            mensajeError(
              errorCarga,
            ),
          );
        } finally {
          setCargando(false);
        }
      },
      [fuente],
    );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function confirmar(
    version: VersionPendiente,
  ): Promise<void> {
    if (
      version.requiereAceptacion &&
      !aceptadas[version.id]
    ) {
      setError(
        "Revisa y acepta las advertencias o ajustes antes de confirmar.",
      );
      return;
    }

    const continuar =
      window.confirm(
        `Se activará la versión #${version.id} de ${version.nombreFuente}. ` +
          "Antes del reemplazo se creará el respaldo configurado por el sistema. ¿Continuar?",
      );

    if (!continuar) {
      return;
    }

    try {
      setProcesandoId(
        version.id,
      );
      setError(null);

      await confirmarVersionPendiente(
        fuente,
        version.id,
        Boolean(
          aceptadas[
            version.id
          ],
        ),
      );

      await cargar();
      await alAplicar();

      window.dispatchEvent(
        new CustomEvent(
          "version-pendiente-actualizada",
          {
            detail: {
              fuente,
              id:
                version.id,
              accion:
                "CONFIRMADA",
            },
          },
        ),
      );
    } catch (
      errorConfirmacion
    ) {
      setError(
        mensajeError(
          errorConfirmacion,
        ),
      );
    } finally {
      setProcesandoId(
        null,
      );
    }
  }

  async function descartar(
    version: VersionPendiente,
  ): Promise<void> {
    const continuar =
      window.confirm(
        `Se descartará la versión validada #${version.id}. ` +
          "La versión activa y los datos actuales no serán modificados. ¿Continuar?",
      );

    if (!continuar) {
      return;
    }

    try {
      setProcesandoId(
        version.id,
      );
      setError(null);

      await descartarVersionPendiente(
        fuente,
        version.id,
      );

      await cargar();

      window.dispatchEvent(
        new CustomEvent(
          "version-pendiente-actualizada",
          {
            detail: {
              fuente,
              id:
                version.id,
              accion:
                "DESCARTADA",
            },
          },
        ),
      );
    } catch (
      errorDescarte
    ) {
      setError(
        mensajeError(
          errorDescarte,
        ),
      );
    } finally {
      setProcesandoId(
        null,
      );
    }
  }

  async function reabrir(
    version: VersionPendiente,
  ): Promise<void> {
    const continuar =
      window.confirm(
        `La versión cancelada #${version.id} volverá a quedar VALIDADA. ` +
          "Se conservará el análisis almacenado y todavía no se modificarán los datos activos. ¿Continuar?",
      );

    if (!continuar) {
      return;
    }

    try {
      setProcesandoId(
        version.id,
      );
      setError(null);

      await reabrirVersionCancelada(
        fuente,
        version.id,
      );

      await cargar();

      setExpandidaId(
        version.id,
      );

      window.dispatchEvent(
        new CustomEvent(
          "version-pendiente-actualizada",
          {
            detail: {
              fuente,
              id:
                version.id,
              accion:
                "REABIERTA",
            },
          },
        ),
      );
    } catch (
      errorReapertura
    ) {
      setError(
        mensajeError(
          errorReapertura,
        ),
      );
    } finally {
      setProcesandoId(
        null,
      );
    }
  }

  if (
    cargando &&
    versiones.length === 0 &&
    canceladas.length === 0
  ) {
    return (
      <aside className="version-pendiente-cargando">
        Verificando versiones
        pendientes y canceladas…
      </aside>
    );
  }

  if (
    !cargando &&
    versiones.length === 0 &&
    canceladas.length === 0 &&
    error === null
  ) {
    return null;
  }

  return (
    <section className="versiones-pendientes-panel">
      <header className="versiones-pendientes-cabecera">
        <div>
          <span>
            Continuidad del proceso
          </span>

          <h3>
            Gestión de versiones sin aplicar
          </h3>

          <p>
            Las versiones validadas
            pueden revisarse y
            activarse. Las canceladas
            pueden reabrirse o volver a
            analizarse seleccionando
            nuevamente el mismo archivo.
          </p>
        </div>

        <button
          type="button"
          className="boton-ligero"
          disabled={cargando}
          onClick={() =>
            void cargar()
          }
        >
          {cargando
            ? "Actualizando…"
            : "Actualizar estado"}
        </button>
      </header>

      {error && (
        <div className="version-pendiente-error">
          <strong>
            Atención
          </strong>
          <span>{error}</span>
        </div>
      )}

      {versiones.length > 0 && (
        <>
          <div className="versiones-pendientes-subtitulo">
            <div>
              <strong>
                Pendientes de activación
              </strong>
              <span>
                Revisa el análisis antes de
                crear el respaldo y aplicar.
              </span>
            </div>

            <b>{versiones.length}</b>
          </div>

          <div className="versiones-pendientes-lista">
            {versiones.map(
              (version) => {
                const expandida =
                  expandidaId ===
                  version.id;

                const procesando =
                  procesandoId ===
                  version.id;

                return (
                  <article
                    className="version-pendiente-tarjeta"
                    key={version.id}
                  >
                    <header>
                      <div>
                        <span className="version-pendiente-estado">
                          VALIDADA
                        </span>

                        <h4>
                          {version.nombreFuente} ·
                          versión #{version.id}
                        </h4>

                        <small>
                          Analizada el{" "}
                          {formatearFecha(
                            version.fechaAnalisis,
                          )}
                        </small>
                      </div>

                      <div className="version-pendiente-acciones-superiores">
                        <button
                          type="button"
                          className="boton-ligero"
                          disabled={procesando}
                          onClick={() =>
                            setExpandidaId(
                              expandida
                                ? null
                                : version.id,
                            )
                          }
                        >
                          {expandida
                            ? "Ocultar revisión"
                            : "Reanudar revisión"}
                        </button>

                        <button
                          type="button"
                          className="version-pendiente-descartar"
                          disabled={procesando}
                          onClick={() =>
                            void descartar(
                              version,
                            )
                          }
                        >
                          Descartar versión
                        </button>
                      </div>
                    </header>

                    <div className="version-pendiente-resumen">
                      {version.metricas.map(
                        (metrica) => (
                          <div
                            key={
                              metrica.etiqueta
                            }
                          >
                            <span>
                              {metrica.etiqueta}
                            </span>
                            <strong>
                              {metrica.valor}
                            </strong>
                          </div>
                        ),
                      )}
                    </div>

                    {expandida && (
                      <div className="version-pendiente-detalle">
                        <dl className="version-pendiente-archivo">
                          <div>
                            <dt>Archivo</dt>
                            <dd>
                              {version.archivo
                                ?.nombre ??
                                "Sin archivo"}
                            </dd>
                          </div>

                          <div>
                            <dt>Hoja</dt>
                            <dd>
                              {version.archivo
                                ?.hoja ??
                                "No aplica"}
                            </dd>
                          </div>

                          <div>
                            <dt>Tamaño</dt>
                            <dd>
                              {version.archivo
                                ? formatearTamano(
                                    version
                                      .archivo
                                      .tamanoOriginal,
                                  )
                                : "—"}
                            </dd>
                          </div>

                          <div>
                            <dt>Comentario</dt>
                            <dd>
                              {version.comentario ||
                                "Sin comentario"}
                            </dd>
                          </div>
                        </dl>

                        <AjustesAutomaticosDetalle
                          ajustes={
                            version.ajustes
                          }
                        />

                        {version.advertencias.length >
                          0 && (
                          <section className="version-pendiente-incidencias version-pendiente-advertencias">
                            <h5>
                              Advertencias
                              detectadas
                            </h5>

                            {version.advertencias.map(
                              (
                                item,
                                indice,
                              ) => (
                                <p
                                  key={`${item.fila}-${item.campo}-${indice}`}
                                >
                                  <strong>
                                    {item.fila !==
                                    null
                                      ? `Fila ${item.fila}`
                                      : "Archivo"}
                                  </strong>
                                  {" · "}
                                  {item.campo ??
                                    "advertencia"}
                                  {" · "}
                                  {repararTextoUtf8(
                                    item.mensaje,
                                  )}
                                </p>
                              ),
                            )}
                          </section>
                        )}

                        {version.errores.length >
                          0 && (
                          <section className="version-pendiente-incidencias version-pendiente-errores">
                            <h5>
                              Errores guardados
                            </h5>

                            {version.errores.map(
                              (
                                item,
                                indice,
                              ) => (
                                <p
                                  key={`${item.fila}-${item.campo}-${indice}`}
                                >
                                  <strong>
                                    {item.fila !==
                                    null
                                      ? `Fila ${item.fila}`
                                      : "Archivo"}
                                  </strong>
                                  {" · "}
                                  {item.campo ??
                                    "error"}
                                  {" · "}
                                  {repararTextoUtf8(
                                    item.mensaje,
                                  )}
                                </p>
                              ),
                            )}
                          </section>
                        )}

                        {version.requiereAceptacion && (
                          <label className="version-pendiente-aceptacion">
                            <input
                              type="checkbox"
                              checked={Boolean(
                                aceptadas[
                                  version.id
                                ],
                              )}
                              onChange={(
                                evento,
                              ) =>
                                setAceptadas(
                                  (
                                    actual,
                                  ) => ({
                                    ...actual,
                                    [version.id]:
                                      evento.target
                                        .checked,
                                  }),
                                )
                              }
                            />

                            <span>
                              He revisado las
                              advertencias y
                              los ajustes
                              mostrados, y
                              acepto utilizar
                              esta versión.
                            </span>
                          </label>
                        )}

                        <div className="version-pendiente-confirmar">
                          <p>
                            Al confirmar se
                            utilizará el
                            archivo ya
                            almacenado. No es
                            necesario volver a
                            seleccionarlo.
                          </p>

                          <button
                            type="button"
                            className="boton-primario"
                            disabled={
                              procesando ||
                              (version.requiereAceptacion &&
                                !aceptadas[
                                  version.id
                                ])
                            }
                            onClick={() =>
                              void confirmar(
                                version,
                              )
                            }
                          >
                            {procesando
                              ? "Procesando…"
                              : "Crear respaldo y activar"}
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              },
            )}
          </div>
        </>
      )}

      {canceladas.length > 0 && (
        <section className="versiones-canceladas-seccion">
          <header>
            <div>
              <strong>
                Versiones canceladas reutilizables
              </strong>
              <span>
                Cancelar no elimina el archivo ni
                bloquea una actualización futura.
              </span>
            </div>

            <b>{canceladas.length}</b>
          </header>

          <div className="versiones-canceladas-lista">
            {canceladas.map(
              (version) => {
                const procesando =
                  procesandoId ===
                  version.id;

                return (
                  <article
                    key={version.id}
                    className="version-cancelada-tarjeta"
                  >
                    <div>
                      <span>
                        CANCELADA
                      </span>

                      <h4>
                        {version.nombreFuente} ·
                        versión #{version.id}
                      </h4>

                      <p>
                        {version.archivo
                          ?.nombre ??
                          "Sin archivo"}{" "}
                        · analizada el{" "}
                        {formatearFecha(
                          version.fechaAnalisis,
                        )}
                      </p>
                    </div>

                    <div className="version-cancelada-metricas">
                      {version.metricas.map(
                        (metrica) => (
                          <span
                            key={
                              metrica.etiqueta
                            }
                          >
                            {metrica.etiqueta}:{" "}
                            <strong>
                              {metrica.valor}
                            </strong>
                          </span>
                        ),
                      )}
                    </div>

                    <div className="version-cancelada-acciones">
                      <button
                        type="button"
                        className="boton-primario"
                        disabled={procesando}
                        onClick={() =>
                          void reabrir(
                            version,
                          )
                        }
                      >
                        {procesando
                          ? "Reabriendo…"
                          : "Reabrir para revisión"}
                      </button>

                      <small>
                        También puedes seleccionar
                        nuevamente el mismo archivo
                        en el formulario para ejecutar
                        una validación nueva.
                      </small>
                    </div>
                  </article>
                );
              },
            )}
          </div>
        </section>
      )}
    </section>
  );
}
