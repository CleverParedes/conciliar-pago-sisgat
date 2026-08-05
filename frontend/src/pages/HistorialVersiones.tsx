import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  obtenerHistorialCargas,
  type EstadoVersionHistorial,
  type HistorialCargaItem,
  type TipoFuenteHistorial,
} from "../historial-cargas-api";

import "../historial-cargas-9b.css";

const FUENTES: Array<{
  valor: TipoFuenteHistorial;
  etiqueta: string;
}> = [
  {
    valor: "PAGOS_SISGAT",
    etiqueta:
      "Declaraciones y pagos SisGAT",
  },
  {
    valor: "ORDENES",
    etiqueta: "Órdenes de pago",
  },
  {
    valor: "LIQUIDACIONES",
    etiqueta: "Liquidaciones",
  },
  {
    valor:
      "REQUERIMIENTOS_SISGAT",
    etiqueta:
      "Requerimientos SisGAT",
  },
  {
    valor:
      "REQUERIMIENTOS_MANUALES",
    etiqueta:
      "Requerimientos manuales",
  },
];

const ESTADOS:
Array<{
  valor: EstadoVersionHistorial;
  etiqueta: string;
}> = [
  {
    valor: "ACTIVA",
    etiqueta: "Activa",
  },
  {
    valor: "ARCHIVADA",
    etiqueta: "Archivada",
  },
  {
    valor: "VALIDADA",
    etiqueta: "Validada",
  },
  {
    valor: "PENDIENTE",
    etiqueta: "Pendiente",
  },
  {
    valor: "APLICANDO",
    etiqueta: "Aplicando",
  },
  {
    valor: "FALLIDA",
    etiqueta: "Fallida",
  },
  {
    valor: "CANCELADA",
    etiqueta: "Cancelada",
  },
];

function mensajeError(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado.";
}

function formatearFecha(
  valor: string | null,
): string {
  if (!valor) {
    return "Sin registro";
  }

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
  bytes: number | null,
): string {
  if (
    bytes === null ||
    !Number.isFinite(bytes)
  ) {
    return "Sin registro";
  }

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

function fechaReferencia(
  item: HistorialCargaItem,
): string {
  return (
    item.fechaAplicacion ??
    item.fechaAnalisis ??
    item.createdAt
  );
}

function claseFuente(
  tipo: TipoFuenteHistorial,
): string {
  return (
    "historial9b-fuente " +
    `historial9b-fuente-${tipo.toLowerCase()}`
  );
}

function claseEstado(
  estado: EstadoVersionHistorial,
): string {
  return (
    "historial9b-estado " +
    `historial9b-estado-${estado.toLowerCase()}`
  );
}

function etiquetaEstado(
  estado: EstadoVersionHistorial,
): string {
  return (
    ESTADOS.find(
      (item) =>
        item.valor === estado,
    )?.etiqueta ??
    estado
  );
}

export default function HistorialVersiones() {
  const [
    versiones,
    setVersiones,
  ] =
    useState<
      HistorialCargaItem[]
    >([]);

  const [
    tipo,
    setTipo,
  ] =
    useState<
      TipoFuenteHistorial |
      "TODAS"
    >("TODAS");

  const [
    estado,
    setEstado,
  ] =
    useState<
      EstadoVersionHistorial |
      "TODOS"
    >("TODOS");

  const [
    buscar,
    setBuscar,
  ] =
    useState("");

  const [
    fechaDesde,
    setFechaDesde,
  ] =
    useState("");

  const [
    fechaHasta,
    setFechaHasta,
  ] =
    useState("");

  const [
    claveSeleccionada,
    setClaveSeleccionada,
  ] =
    useState<string | null>(
      null,
    );

  const [
    cargando,
    setCargando,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  async function cargar():
  Promise<void> {
    try {
      setCargando(true);
      setError(null);

      const resultado =
        await obtenerHistorialCargas();

      setVersiones(resultado);

      setClaveSeleccionada(
        (actual) =>
          resultado.some(
            (item) =>
              item.clave === actual,
          )
            ? actual
            : resultado[0]?.clave ??
              null,
      );
    } catch (errorEncontrado) {
      setError(
        mensajeError(
          errorEncontrado,
        ),
      );
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
  }, []);

  const versionesFiltradas =
    useMemo(
      () => {
        const texto =
          buscar
            .trim()
            .toLocaleLowerCase(
              "es-PE",
            );

        const desde =
          fechaDesde
            ? new Date(
                `${fechaDesde}T00:00:00`,
              ).getTime()
            : null;

        const hasta =
          fechaHasta
            ? new Date(
                `${fechaHasta}T23:59:59`,
              ).getTime()
            : null;

        return versiones.filter(
          (item) => {
            if (
              tipo !== "TODAS" &&
              item.tipo !== tipo
            ) {
              return false;
            }

            if (
              estado !== "TODOS" &&
              item.estado !== estado
            ) {
              return false;
            }

            const fecha =
              new Date(
                fechaReferencia(
                  item,
                ),
              ).getTime();

            if (
              desde !== null &&
              fecha < desde
            ) {
              return false;
            }

            if (
              hasta !== null &&
              fecha > hasta
            ) {
              return false;
            }

            if (!texto) {
              return true;
            }

            const contenido = [
              item.tipoEtiqueta,
              item.codigo,
              String(
                item.versionId,
              ),
              item.archivo?.nombre ??
                "",
              item.comentario ?? "",
              item.usuario?.nombre ??
                "",
              item.usuario
                ?.nombreUsuario ??
                "",
            ]
              .join(" ")
              .toLocaleLowerCase(
                "es-PE",
              );

            return contenido.includes(
              texto,
            );
          },
        );
      },
      [
        versiones,
        tipo,
        estado,
        buscar,
        fechaDesde,
        fechaHasta,
      ],
    );

  const seleccionada =
    versionesFiltradas.find(
      (item) =>
        item.clave ===
        claveSeleccionada,
    ) ??
    versionesFiltradas[0] ??
    null;

  const resumen = useMemo(
    () => ({
      total: versiones.length,
      activas:
        versiones.filter(
          (item) =>
            item.estado ===
            "ACTIVA",
        ).length,
      conErrores:
        versiones.filter(
          (item) =>
            item.totalErrores >
            0,
        ).length,
      fuentes:
        FUENTES.filter(
          (fuente) =>
            versiones.some(
              (item) =>
                item.tipo ===
                fuente.valor,
            ),
        ).length,
    }),
    [versiones],
  );

  function limpiarFiltros():
  void {
    setTipo("TODAS");
    setEstado("TODOS");
    setBuscar("");
    setFechaDesde("");
    setFechaHasta("");
  }

  return (
    <main className="pagina-historial-versiones historial9b">
      <header className="pagina-cabecera historial9b-cabecera">
        <div>
          <p className="pagina-etiqueta">
            Administración
          </p>

          <h1>
            Historial de cargas
          </h1>

          <p>
            Consulta las versiones de las cinco fuentes independientes sin modificar los datos activos.
          </p>
        </div>

        <button
          className="boton-ligero"
          type="button"
          disabled={cargando}
          onClick={() =>
            void cargar()
          }
        >
          {cargando
            ? "Actualizando..."
            : "Actualizar"}
        </button>
      </header>

      {error && (
        <div className="historial9b-alerta historial9b-alerta-error">
          <span>{error}</span>

          <button
            type="button"
            onClick={() =>
              setError(null)
            }
          >
            ×
          </button>
        </div>
      )}

      <section className="historial9b-resumen">
        <article>
          <span>
            Versiones registradas
          </span>
          <strong>
            {resumen.total}
          </strong>
          <small>
            Todas las fuentes
          </small>
        </article>

        <article>
          <span>
            Versiones activas
          </span>
          <strong>
            {resumen.activas}
          </strong>
          <small>
            Una por cada fuente
          </small>
        </article>

        <article>
          <span>
            Fuentes disponibles
          </span>
          <strong>
            {resumen.fuentes}
          </strong>
          <small>
            De cinco fuentes
          </small>
        </article>

        <article>
          <span>
            Cargas con errores
          </span>
          <strong>
            {resumen.conErrores}
          </strong>
          <small>
            Requieren revisión
          </small>
        </article>
      </section>

      <section className="historial9b-fuentes">
        {FUENTES.map(
          (fuente) => {
            const items =
              versiones.filter(
                (item) =>
                  item.tipo ===
                  fuente.valor,
              );

            const activa =
              items.find(
                (item) =>
                  item.estado ===
                  "ACTIVA",
              );

            return (
              <button
                key={
                  fuente.valor
                }
                type="button"
                className={
                  tipo ===
                  fuente.valor
                    ? `${claseFuente(
                        fuente.valor,
                      )} historial9b-fuente-seleccionada`
                    : claseFuente(
                        fuente.valor,
                      )
                }
                onClick={() =>
                  setTipo(
                    tipo ===
                      fuente.valor
                      ? "TODAS"
                      : fuente.valor,
                  )
                }
              >
                <span>
                  {fuente.etiqueta}
                </span>

                <strong>
                  {items.length}
                </strong>

                <small>
                  {activa
                    ? `Activa: versión #${activa.versionId}`
                    : "Sin versión activa"}
                </small>
              </button>
            );
          },
        )}
      </section>

      <section className="historial9b-panel">
        <header>
          <div>
            <p className="pagina-etiqueta">
              Filtros
            </p>
            <h2>
              Buscar cargas
            </h2>
          </div>

          <button
            className="boton-ligero"
            type="button"
            onClick={
              limpiarFiltros
            }
          >
            Limpiar filtros
          </button>
        </header>

        <div className="historial9b-filtros">
          <label className="historial9b-filtro-buscar">
            <span>Buscar</span>

            <input
              type="search"
              value={buscar}
              placeholder="Archivo, código, comentario o responsable"
              onChange={(evento) =>
                setBuscar(
                  evento.target
                    .value,
                )
              }
            />
          </label>

          <label>
            <span>
              Tipo de información
            </span>

            <select
              value={tipo}
              onChange={(evento) =>
                setTipo(
                  evento.target
                    .value as
                    | TipoFuenteHistorial
                    | "TODAS",
                )
              }
            >
              <option value="TODAS">
                Todas las fuentes
              </option>

              {FUENTES.map(
                (fuente) => (
                  <option
                    key={
                      fuente.valor
                    }
                    value={
                      fuente.valor
                    }
                  >
                    {
                      fuente.etiqueta
                    }
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            <span>Estado</span>

            <select
              value={estado}
              onChange={(evento) =>
                setEstado(
                  evento.target
                    .value as
                    | EstadoVersionHistorial
                    | "TODOS",
                )
              }
            >
              <option value="TODOS">
                Todos los estados
              </option>

              {ESTADOS.map(
                (opcion) => (
                  <option
                    key={
                      opcion.valor
                    }
                    value={
                      opcion.valor
                    }
                  >
                    {
                      opcion.etiqueta
                    }
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            <span>Desde</span>

            <input
              type="date"
              value={fechaDesde}
              onChange={(evento) =>
                setFechaDesde(
                  evento.target
                    .value,
                )
              }
            />
          </label>

          <label>
            <span>Hasta</span>

            <input
              type="date"
              value={fechaHasta}
              onChange={(evento) =>
                setFechaHasta(
                  evento.target
                    .value,
                )
              }
            />
          </label>
        </div>
      </section>

      {cargando ? (
        <section className="historial-cargando historial9b-cargando">
          <div className="sesion-spinner" />
          <strong>
            Consultando las cinco fuentes
          </strong>
        </section>
      ) : versionesFiltradas.length ===
        0 ? (
        <section className="historial-vacio historial9b-vacio">
          <h2>
            No se encontraron cargas
          </h2>
          <p>
            Modifica o limpia los filtros para ver otros resultados.
          </p>
        </section>
      ) : (
        <div className="historial9b-contenido">
          <section className="historial9b-listado">
            <header>
              <div>
                <p className="pagina-etiqueta">
                  Resultados
                </p>
                <h2>
                  Versiones encontradas
                </h2>
              </div>

              <span>
                {
                  versionesFiltradas.length
                }
              </span>
            </header>

            <div className="historial9b-tabla-contenedor">
              <table className="historial9b-tabla">
                <thead>
                  <tr>
                    <th>
                      Información
                    </th>
                    <th>Versión</th>
                    <th>Estado</th>
                    <th>Archivo</th>
                    <th>Registros</th>
                    <th>Errores</th>
                    <th>Fecha</th>
                  </tr>
                </thead>

                <tbody>
                  {versionesFiltradas.map(
                    (item) => (
                      <tr
                        key={
                          item.clave
                        }
                        className={
                          seleccionada
                            ?.clave ===
                          item.clave
                            ? "historial9b-fila-seleccionada"
                            : ""
                        }
                        onClick={() =>
                          setClaveSeleccionada(
                            item.clave,
                          )
                        }
                      >
                        <td>
                          <strong>
                            {
                              item.tipoEtiqueta
                            }
                          </strong>
                        </td>

                        <td>
                          <strong>
                            #
                            {
                              item.versionId
                            }
                          </strong>
                          <small>
                            {
                              item.codigo
                            }
                          </small>
                        </td>

                        <td>
                          <span
                            className={
                              claseEstado(
                                item.estado,
                              )
                            }
                          >
                            {
                              etiquetaEstado(
                                item.estado,
                              )
                            }
                          </span>
                        </td>

                        <td>
                          <strong>
                            {item
                              .archivo
                              ?.nombre ??
                              "Sin archivo"}
                          </strong>
                        </td>

                        <td>
                          <strong>
                            {
                              item
                                .principal
                                .total
                            }
                          </strong>
                          <small>
                            {
                              item
                                .principal
                                .etiqueta
                            }
                          </small>
                        </td>

                        <td>
                          <strong>
                            {
                              item.totalErrores
                            }
                          </strong>
                        </td>

                        <td>
                          {formatearFecha(
                            fechaReferencia(
                              item,
                            ),
                          )}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {seleccionada && (
            <aside className="historial9b-detalle">
              <header>
                <div>
                  <p className="pagina-etiqueta">
                    Detalle de carga
                  </p>
                  <h2>
                    {
                      seleccionada.tipoEtiqueta
                    }
                  </h2>
                  <p>
                    Versión #
                    {
                      seleccionada.versionId
                    }
                  </p>
                </div>

                <span
                  className={
                    claseEstado(
                      seleccionada.estado,
                    )
                  }
                >
                  {etiquetaEstado(
                    seleccionada.estado,
                  )}
                </span>
              </header>

              <section className="historial9b-detalle-metricas">
                <article>
                  <span>
                    {
                      seleccionada
                        .principal
                        .etiqueta
                    }
                  </span>
                  <strong>
                    {
                      seleccionada
                        .principal.total
                    }
                  </strong>
                </article>

                <article>
                  <span>
                    {
                      seleccionada
                        .secundario
                        .etiqueta
                    }
                  </span>
                  <strong>
                    {
                      seleccionada
                        .secundario.total
                    }
                  </strong>
                </article>

                <article>
                  <span>Errores</span>
                  <strong>
                    {
                      seleccionada.totalErrores
                    }
                  </strong>
                </article>

                <article>
                  <span>
                    Advertencias
                  </span>
                  <strong>
                    {
                      seleccionada.totalAdvertencias
                    }
                  </strong>
                </article>
              </section>

              <dl className="historial9b-detalle-datos">
                <div>
                  <dt>
                    Código de versión
                  </dt>
                  <dd>
                    {
                      seleccionada.codigo
                    }
                  </dd>
                </div>

                <div>
                  <dt>Archivo</dt>
                  <dd>
                    {seleccionada
                      .archivo
                      ?.nombre ??
                      "Sin archivo asociado"}
                  </dd>
                </div>

                {seleccionada
                  .archivo?.hoja && (
                  <div>
                    <dt>
                      Hoja de Excel
                    </dt>
                    <dd>
                      {
                        seleccionada
                          .archivo.hoja
                      }
                    </dd>
                  </div>
                )}

                <div>
                  <dt>
                    Tamaño del archivo
                  </dt>
                  <dd>
                    {formatearTamano(
                      seleccionada
                        .archivo
                        ?.tamano ??
                        null,
                    )}
                  </dd>
                </div>

                <div>
                  <dt>
                    Filas del archivo
                  </dt>
                  <dd>
                    {seleccionada
                      .archivo
                      ? `${seleccionada.archivo.filasValidas} válidas de ${seleccionada.archivo.totalFilas}`
                      : "Sin registro"}
                  </dd>
                </div>

                {seleccionada
                  .anioGestion !==
                  null && (
                  <div>
                    <dt>
                      Año de gestión
                    </dt>
                    <dd>
                      {
                        seleccionada.anioGestion
                      }
                    </dd>
                  </div>
                )}

                <div>
                  <dt>Responsable</dt>
                  <dd>
                    {seleccionada
                      .usuario
                      ?.nombre ??
                      "Sin responsable"}
                  </dd>
                </div>

                <div>
                  <dt>
                    Fecha de análisis
                  </dt>
                  <dd>
                    {formatearFecha(
                      seleccionada
                        .fechaAnalisis,
                    )}
                  </dd>
                </div>

                <div>
                  <dt>
                    Fecha de aplicación
                  </dt>
                  <dd>
                    {formatearFecha(
                      seleccionada
                        .fechaAplicacion,
                    )}
                  </dd>
                </div>

                <div>
                  <dt>Comentario</dt>
                  <dd>
                    {seleccionada
                      .comentario ??
                      "Sin comentario"}
                  </dd>
                </div>
              </dl>

              <div className="historial9b-solo-consulta">
                <strong>
                  Historial de consulta
                </strong>
                <p>
                  Esta pantalla no restaura ni modifica versiones. Las actualizaciones se realizan únicamente desde Actualización de datos.
                </p>
              </div>
            </aside>
          )}
        </div>
      )}
    </main>
  );
}
