import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import {
  descargarReporteRequerimientosManuales,
  obtenerReporteRequerimientosManuales,
  type EstadoConciliacionReporteManual,
  type EstadoNotificacionReporteManual,
  type EstadoRevisionReporteManual,
  type FiltrosReporteRequerimientosManuales,
  type ResumenReporteRequerimientosManuales,
  type TipoRegistroReporteManual,
} from "../reportes-requerimientos-manuales-api";

import "./ReporteRequerimientosManuales.css";

const TIPOS: Array<{
  valor:
    TipoRegistroReporteManual;
  etiqueta: string;
}> = [
  {
    valor:
      "REGISTRO_COMPLETO",
    etiqueta:
      "Registro completo",
  },
  {
    valor: "INCOMPLETO",
    etiqueta: "Incompleto",
  },
  {
    valor: "VACIO",
    etiqueta: "Vacío",
  },
  {
    valor: "SIN_REGISTRO",
    etiqueta:
      "Sin registro",
  },
  {
    valor: "ANULADO",
    etiqueta: "Anulado",
  },
];

const CONCILIACIONES: Array<{
  valor:
    EstadoConciliacionReporteManual;
  etiqueta: string;
}> = [
  {
    valor: "PAGADO",
    etiqueta: "Pagado",
  },
  {
    valor: "PAGO_PARCIAL",
    etiqueta:
      "Pago parcial",
  },
  {
    valor: "PENDIENTE",
    etiqueta: "Pendiente",
  },
  {
    valor: "SIN_DECLARACION",
    etiqueta:
      "Sin declaración",
  },
  {
    valor: "REVISAR",
    etiqueta: "Revisar",
  },
  {
    valor: "ANULADO",
    etiqueta: "Anulado",
  },
  {
    valor: "NO_APLICA",
    etiqueta: "No aplica",
  },
];

const REVISIONES: Array<{
  valor:
    EstadoRevisionReporteManual;
  etiqueta: string;
}> = [
  {
    valor: "COINCIDE",
    etiqueta: "Coincide",
  },
  {
    valor: "DISCREPANCIA",
    etiqueta:
      "Discrepancia",
  },
  {
    valor: "PENDIENTE",
    etiqueta: "Pendiente",
  },
  {
    valor: "REVISAR",
    etiqueta: "Revisar",
  },
  {
    valor: "NO_APLICA",
    etiqueta: "No aplica",
  },
];

const NOTIFICACIONES: Array<{
  valor:
    EstadoNotificacionReporteManual;
  etiqueta: string;
}> = [
  {
    valor: "SIN_ASIGNAR",
    etiqueta:
      "Sin asignar",
  },
  {
    valor: "ASIGNADO",
    etiqueta: "Asignado",
  },
  {
    valor:
      "PENDIENTE_NOTIFICACION",
    etiqueta:
      "Pendiente de notificación",
  },
  {
    valor: "NOTIFICADO",
    etiqueta: "Notificado",
  },
  {
    valor: "NO_NOTIFICADO",
    etiqueta:
      "No notificado",
  },
  {
    valor: "OBSERVADO",
    etiqueta: "Observado",
  },
];

const formatoMoneda =
  new Intl.NumberFormat(
    "es-PE",
    {
      style: "currency",
      currency: "PEN",
      minimumFractionDigits: 2,
    },
  );

function moneda(
  valor: number,
): string {
  return formatoMoneda.format(
    Number(valor ?? 0),
  );
}

function fechaHora(
  valor: string | null,
): string {
  if (!valor) {
    return "Sin registro";
  }

  const fecha =
    new Date(valor);

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

function fechaSimple(
  valor: string | null,
): string {
  if (!valor) {
    return "—";
  }

  const fecha =
    new Date(valor);

  if (
    Number.isNaN(
      fecha.getTime(),
    )
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "es-PE",
    {
      dateStyle: "short",
      timeZone: "UTC",
    },
  ).format(fecha);
}

function mensajeError(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado.";
}

function etiqueta(
  valor: string,
): string {
  const opciones = [
    ...TIPOS,
    ...CONCILIACIONES,
    ...REVISIONES,
    ...NOTIFICACIONES,
  ];

  return (
    opciones.find(
      (item) =>
        item.valor === valor,
    )?.etiqueta ??
    valor.replaceAll("_", " ")
  );
}

export default function ReporteRequerimientosManuales() {
  const [
    buscar,
    setBuscar,
  ] = useState("");

  const [
    tipoRegistro,
    setTipoRegistro,
  ] =
    useState<
      | TipoRegistroReporteManual
      | ""
    >("");

  const [
    estadoConciliado,
    setEstadoConciliado,
  ] =
    useState<
      | EstadoConciliacionReporteManual
      | ""
    >("");

  const [
    estadoRevision,
    setEstadoRevision,
  ] =
    useState<
      | EstadoRevisionReporteManual
      | ""
    >("");

  const [
    estadoNotificacion,
    setEstadoNotificacion,
  ] =
    useState<
      | EstadoNotificacionReporteManual
      | ""
    >("");

  const [
    anioGestion,
    setAnioGestion,
  ] = useState("");

  const [
    periodoAnio,
    setPeriodoAnio,
  ] = useState("");

  const [
    fechaNotificacionDesde,
    setFechaNotificacionDesde,
  ] = useState("");

  const [
    fechaNotificacionHasta,
    setFechaNotificacionHasta,
  ] = useState("");

  const [
    resumen,
    setResumen,
  ] =
    useState<ResumenReporteRequerimientosManuales | null>(
      null,
    );

  const [
    consultando,
    setConsultando,
  ] = useState(true);

  const [
    descargando,
    setDescargando,
  ] = useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    mensaje,
    setMensaje,
  ] =
    useState<string | null>(
      null,
    );

  const filtros =
    useMemo<FiltrosReporteRequerimientosManuales>(
      () => ({
        buscar:
          buscar.trim(),
        tipoRegistro,
        estadoConciliado,
        estadoRevision,
        estadoNotificacion,
        anioGestion:
          anioGestion
            ? Number(
                anioGestion,
              )
            : null,
        periodoAnio:
          periodoAnio
            ? Number(
                periodoAnio,
              )
            : null,
        fechaNotificacionDesde,
        fechaNotificacionHasta,
      }),
      [
        buscar,
        tipoRegistro,
        estadoConciliado,
        estadoRevision,
        estadoNotificacion,
        anioGestion,
        periodoAnio,
        fechaNotificacionDesde,
        fechaNotificacionHasta,
      ],
    );

  async function consultar(
    filtrosAplicados:
      FiltrosReporteRequerimientosManuales,
  ): Promise<void> {
    try {
      setConsultando(true);
      setError(null);

      setResumen(
        await obtenerReporteRequerimientosManuales(
          filtrosAplicados,
        ),
      );
    } catch (errorEncontrado) {
      setError(
        mensajeError(
          errorEncontrado,
        ),
      );
    } finally {
      setConsultando(false);
    }
  }

  useEffect(() => {
    void consultar({
      buscar: "",
      tipoRegistro: "",
      estadoConciliado: "",
      estadoRevision: "",
      estadoNotificacion: "",
      anioGestion: null,
      periodoAnio: null,
      fechaNotificacionDesde:
        "",
      fechaNotificacionHasta:
        "",
    });
  }, []);

  async function aplicarFiltros(
    evento: FormEvent,
  ): Promise<void> {
    evento.preventDefault();
    setMensaje(null);

    await consultar(
      filtros,
    );
  }

  async function limpiar():
  Promise<void> {
    setBuscar("");
    setTipoRegistro("");
    setEstadoConciliado("");
    setEstadoRevision("");
    setEstadoNotificacion("");
    setAnioGestion("");
    setPeriodoAnio("");
    setFechaNotificacionDesde("");
    setFechaNotificacionHasta("");
    setMensaje(null);

    await consultar({
      buscar: "",
      tipoRegistro: "",
      estadoConciliado: "",
      estadoRevision: "",
      estadoNotificacion: "",
      anioGestion: null,
      periodoAnio: null,
      fechaNotificacionDesde:
        "",
      fechaNotificacionHasta:
        "",
    });
  }

  async function descargar():
  Promise<void> {
    try {
      setDescargando(true);
      setError(null);
      setMensaje(null);

      const nombre =
        await descargarReporteRequerimientosManuales(
          filtros,
        );

      setMensaje(
        `El archivo ${nombre} se descargó correctamente.`,
      );
    } catch (errorDescarga) {
      setError(
        mensajeError(
          errorDescarga,
        ),
      );
    } finally {
      setDescargando(false);
    }
  }

  return (
    <main className="reporte-req-manual">
      <header className="reporte-req-manual-cabecera">
        <div>
          <p className="pagina-etiqueta">
            Reportes
          </p>

          <h1>
            Reporte independiente de Requerimientos manuales
          </h1>

          <p>
            Consulta el Excel operativo activo y analiza por separado la
            conciliación con pagos, la revisión de discrepancias y el proceso
            de notificación.
          </p>
        </div>

        {resumen && (
          <aside className="reporte-req-manual-version">
            <span>
              Versión independiente activa
            </span>

            <strong>
              #{resumen.versionActiva.id}
            </strong>

            <small>
              Gestión{" "}
              {
                resumen.versionActiva
                  .anioGestion
              }{" "}
              ·{" "}
              {resumen.versionActiva
                .archivo
                ?.nombreArchivo ??
                "Sin archivo"}
            </small>

            <small>
              Aplicada:{" "}
              {fechaHora(
                resumen.versionActiva
                  .fechaAplicacion,
              )}
            </small>
          </aside>
        )}
      </header>

      {error && (
        <div className="reporte-req-manual-alerta reporte-req-manual-alerta-error">
          <span>
            {error}
          </span>

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

      {mensaje && (
        <div className="reporte-req-manual-alerta reporte-req-manual-alerta-exito">
          <span>
            {mensaje}
          </span>

          <button
            type="button"
            onClick={() =>
              setMensaje(null)
            }
          >
            ×
          </button>
        </div>
      )}

      <section className="reporte-req-manual-panel">
        <div className="reporte-req-manual-panel-cabecera">
          <div>
            <h2>
              Filtros del reporte
            </h2>

            <p>
              Busca por requerimiento, placa, propietario, ubicación,
              notificador, responsable, cedulón o liquidación de deuda.
            </p>
          </div>

          <button
            className="reporte-req-manual-boton-secundario"
            type="button"
            disabled={
              consultando ||
              descargando
            }
            onClick={() =>
              void limpiar()
            }
          >
            Limpiar filtros
          </button>
        </div>

        <form
          className="reporte-req-manual-formulario"
          onSubmit={
            aplicarFiltros
          }
        >
          <label className="reporte-req-manual-campo reporte-req-manual-busqueda">
            <span>
              Buscar
            </span>

            <input
              type="search"
              value={buscar}
              placeholder="Requerimiento, placa, propietario, dirección o notificador"
              onChange={(evento) =>
                setBuscar(
                  evento.target
                    .value,
                )
              }
            />
          </label>

          <label className="reporte-req-manual-campo">
            <span>
              Tipo de registro
            </span>

            <select
              value={tipoRegistro}
              onChange={(evento) =>
                setTipoRegistro(
                  evento.target
                    .value as
                    | TipoRegistroReporteManual
                    | "",
                )
              }
            >
              <option value="">
                Todos
              </option>

              {TIPOS.map(
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

          <label className="reporte-req-manual-campo">
            <span>
              Conciliación
            </span>

            <select
              value={
                estadoConciliado
              }
              onChange={(evento) =>
                setEstadoConciliado(
                  evento.target
                    .value as
                    | EstadoConciliacionReporteManual
                    | "",
                )
              }
            >
              <option value="">
                Todos
              </option>

              {CONCILIACIONES.map(
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

          <label className="reporte-req-manual-campo">
            <span>
              Revisión
            </span>

            <select
              value={
                estadoRevision
              }
              onChange={(evento) =>
                setEstadoRevision(
                  evento.target
                    .value as
                    | EstadoRevisionReporteManual
                    | "",
                )
              }
            >
              <option value="">
                Todos
              </option>

              {REVISIONES.map(
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

          <label className="reporte-req-manual-campo">
            <span>
              Notificación
            </span>

            <select
              value={
                estadoNotificacion
              }
              onChange={(evento) =>
                setEstadoNotificacion(
                  evento.target
                    .value as
                    | EstadoNotificacionReporteManual
                    | "",
                )
              }
            >
              <option value="">
                Todos
              </option>

              {NOTIFICACIONES.map(
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

          <label className="reporte-req-manual-campo">
            <span>
              Año de gestión
            </span>

            <input
              type="number"
              min="1900"
              max="2100"
              value={anioGestion}
              placeholder="Todos"
              onChange={(evento) =>
                setAnioGestion(
                  evento.target
                    .value,
                )
              }
            />
          </label>

          <label className="reporte-req-manual-campo">
            <span>
              Año del periodo
            </span>

            <input
              type="number"
              min="1900"
              max="2100"
              value={periodoAnio}
              placeholder="Todos"
              onChange={(evento) =>
                setPeriodoAnio(
                  evento.target
                    .value,
                )
              }
            />
          </label>

          <label className="reporte-req-manual-campo">
            <span>
              Notificación desde
            </span>

            <input
              type="date"
              value={
                fechaNotificacionDesde
              }
              onChange={(evento) =>
                setFechaNotificacionDesde(
                  evento.target
                    .value,
                )
              }
            />
          </label>

          <label className="reporte-req-manual-campo">
            <span>
              Notificación hasta
            </span>

            <input
              type="date"
              value={
                fechaNotificacionHasta
              }
              onChange={(evento) =>
                setFechaNotificacionHasta(
                  evento.target
                    .value,
                )
              }
            />
          </label>

          <button
            className="reporte-req-manual-boton-aplicar"
            type="submit"
            disabled={
              consultando ||
              descargando
            }
          >
            {consultando
              ? "Consultando..."
              : "Aplicar filtros"}
          </button>
        </form>
      </section>

      {consultando &&
      !resumen ? (
        <section className="reporte-req-manual-cargando">
          <div className="sesion-spinner" />

          <strong>
            Preparando el reporte
          </strong>

          <span>
            Consultando la versión independiente activa…
          </span>
        </section>
      ) : resumen ? (
        <>
          <section className="reporte-req-manual-metricas">
            <article>
              <span>
                Requerimientos
              </span>

              <strong>
                {
                  resumen.totales
                    .requerimientos
                }
              </strong>
            </article>

            <article>
              <span>
                Periodos
              </span>

              <strong>
                {
                  resumen.totales
                    .periodos
                }
              </strong>
            </article>

            <article>
              <span>
                Propietarios
              </span>

              <strong>
                {
                  resumen.totales
                    .propietarios
                }
              </strong>
            </article>

            <article>
              <span>
                Monto pagado
              </span>

              <strong>
                {moneda(
                  resumen.totales
                    .totalPagado,
                )}
              </strong>
            </article>

            <article>
              <span>
                Notificados
              </span>

              <strong>
                {
                  resumen.totales
                    .notificados
                }
              </strong>
            </article>

            <article>
              <span>
                Discrepancias
              </span>

              <strong>
                {
                  resumen.totales
                    .discrepancias
                }
              </strong>
            </article>
          </section>

          <section className="reporte-req-manual-distribuciones">
            <article>
              <h3>
                Conciliación
              </h3>

              {resumen.conciliacion.map(
                (fila) => (
                  <div
                    key={
                      fila.estado
                    }
                  >
                    <span>
                      {etiqueta(
                        fila.estado,
                      )}
                    </span>

                    <strong>
                      {
                        fila.cantidad
                      }
                    </strong>
                  </div>
                ),
              )}
            </article>

            <article>
              <h3>
                Revisión
              </h3>

              {resumen.revision.map(
                (fila) => (
                  <div
                    key={
                      fila.estado
                    }
                  >
                    <span>
                      {etiqueta(
                        fila.estado,
                      )}
                    </span>

                    <strong>
                      {
                        fila.cantidad
                      }
                    </strong>
                  </div>
                ),
              )}
            </article>

            <article>
              <h3>
                Notificación
              </h3>

              {resumen.notificacion.map(
                (fila) => (
                  <div
                    key={
                      fila.estado
                    }
                  >
                    <span>
                      {etiqueta(
                        fila.estado,
                      )}
                    </span>

                    <strong>
                      {
                        fila.cantidad
                      }
                    </strong>
                  </div>
                ),
              )}
            </article>

            <article>
              <h3>
                Tipo de registro
              </h3>

              {resumen.tipos.map(
                (fila) => (
                  <div
                    key={
                      fila.estado
                    }
                  >
                    <span>
                      {etiqueta(
                        fila.estado,
                      )}
                    </span>

                    <strong>
                      {
                        fila.cantidad
                      }
                    </strong>
                  </div>
                ),
              )}
            </article>
          </section>

          <section className="reporte-req-manual-resultados">
            <header>
              <div>
                <h2>
                  Vista previa
                </h2>

                <p>
                  Se muestran hasta 50 registros. El Excel contiene todos los
                  resultados y el seguimiento operativo relacionado.
                </p>
              </div>

              <button
                className="reporte-req-manual-boton-descargar"
                type="button"
                disabled={
                  descargando ||
                  consultando ||
                  resumen.totales
                    .requerimientos ===
                    0
                }
                onClick={() =>
                  void descargar()
                }
              >
                {descargando
                  ? "Generando Excel..."
                  : "Descargar Excel"}
              </button>
            </header>

            {resumen.muestra.length ===
            0 ? (
              <div className="reporte-req-manual-vacio">
                <strong>
                  No existen Requerimientos manuales con estos filtros
                </strong>

                <p>
                  Cambia los criterios antes de generar el archivo.
                </p>
              </div>
            ) : (
              <div className="reporte-req-manual-tabla-contenedor">
                <table className="reporte-req-manual-tabla">
                  <thead>
                    <tr>
                      <th>
                        Requerimiento
                      </th>

                      <th>
                        Fecha
                      </th>

                      <th>
                        Placa
                      </th>

                      <th>
                        Propietario
                      </th>

                      <th>
                        Deuda
                      </th>

                      <th>
                        Estado Excel
                      </th>

                      <th>
                        Conciliación
                      </th>

                      <th>
                        Revisión
                      </th>

                      <th>
                        Notificación
                      </th>

                      <th>
                        Notificador
                      </th>

                      <th>
                        Periodos
                      </th>

                      <th>
                        Pagado
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {resumen.muestra.map(
                      (
                        requerimiento,
                      ) => (
                        <tr
                          key={
                            requerimiento.id
                          }
                        >
                          <td>
                            <strong>
                              {
                                requerimiento
                                  .anioGestion
                              }
                              -
                              {
                                requerimiento
                                  .numeroRequerimiento
                              }
                            </strong>

                            <small>
                              {etiqueta(
                                requerimiento
                                  .tipoRegistro,
                              )}
                            </small>
                          </td>

                          <td>
                            {fechaSimple(
                              requerimiento
                                .fechaRequerimiento,
                            )}
                          </td>

                          <td>
                            {requerimiento
                              .placa ??
                              "—"}
                          </td>

                          <td>
                            {requerimiento
                              .propietario ??
                              "—"}
                          </td>

                          <td>
                            {requerimiento
                              .deuda ??
                              "—"}
                          </td>

                          <td>
                            {requerimiento
                              .estadoManualOriginal ??
                              "—"}
                          </td>

                          <td>
                            <span className="reporte-req-manual-etiqueta reporte-req-manual-etiqueta-conciliacion">
                              {etiqueta(
                                requerimiento
                                  .estadoConciliado,
                              )}
                            </span>
                          </td>

                          <td>
                            <span className="reporte-req-manual-etiqueta reporte-req-manual-etiqueta-revision">
                              {etiqueta(
                                requerimiento
                                  .estadoRevision,
                              )}
                            </span>
                          </td>

                          <td>
                            <span className="reporte-req-manual-etiqueta reporte-req-manual-etiqueta-notificacion">
                              {etiqueta(
                                requerimiento
                                  .estadoNotificacion,
                              )}
                            </span>
                          </td>

                          <td>
                            {requerimiento
                              .notificador ??
                              "—"}

                            <small>
                              {fechaSimple(
                                requerimiento
                                  .fechaNotificacion,
                              )}
                            </small>
                          </td>

                          <td>
                            {
                              requerimiento
                                .periodos
                            }
                          </td>

                          <td>
                            {moneda(
                              requerimiento
                                .montoPagado,
                            )}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="reporte-req-manual-excel">
            <h2>
              Contenido del archivo Excel
            </h2>

            <div>
              <article>
                <strong>
                  Resumen
                </strong>

                <p>
                  Versión activa, filtros, métricas y distribución de estados.
                </p>
              </article>

              <article>
                <strong>
                  Requerimientos manuales
                </strong>

                <p>
                  Datos originales, resultados calculados y situación
                  operativa actual.
                </p>
              </article>

              <article>
                <strong>
                  Periodos y pagos
                </strong>

                <p>
                  Año de deuda, declaración vinculada, conciliación y monto
                  pagado.
                </p>
              </article>

              <article>
                <strong>
                  Seguimiento operativo
                </strong>

                <p>
                  Notificador, responsable, cedulón, fechas y observaciones.
                </p>
              </article>

              <article>
                <strong>
                  Historial de cambios
                </strong>

                <p>
                  Acciones, campos modificados, valores y usuario responsable.
                </p>
              </article>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
