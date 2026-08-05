import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import {
  descargarReporteOrdenesIndependiente,
  obtenerReporteOrdenesIndependiente,
  type EstadoReporteOrdenes,
  type FiltrosReporteOrdenesIndependiente,
  type ResumenReporteOrdenesIndependiente,
} from "../reportes-ordenes-api";

import "./Reportes.css";

const ESTADOS: Array<{
  valor:
    EstadoReporteOrdenes;
  etiqueta: string;
}> = [
  {
    valor: "PAGADO",
    etiqueta: "Pagado",
  },
  {
    valor: "PAGO_PARCIAL",
    etiqueta: "Pago parcial",
  },
  {
    valor: "PENDIENTE",
    etiqueta: "Pendiente",
  },
  {
    valor: "SIN_DECLARACION",
    etiqueta: "Sin declaración",
  },
  {
    valor: "PAGO_ANULADO",
    etiqueta: "Pago anulado",
  },
  {
    valor: "ANULADO",
    etiqueta: "Anulado",
  },
  {
    valor: "SOBREPAGO",
    etiqueta: "Sobrepago",
  },
  {
    valor: "REVISAR",
    etiqueta: "Revisar",
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

function etiquetaEstado(
  estado:
    EstadoReporteOrdenes,
): string {
  return (
    ESTADOS.find(
      (item) =>
        item.valor === estado,
    )?.etiqueta ??
    estado.replaceAll("_", " ")
  );
}

export default function Reportes() {
  const [
    buscar,
    setBuscar,
  ] = useState("");
  const [
    estado,
    setEstado,
  ] =
    useState<
      EstadoReporteOrdenes | ""
    >("");
  const [
    anioOrden,
    setAnioOrden,
  ] = useState("");
  const [
    periodoAnio,
    setPeriodoAnio,
  ] = useState("");
  const [
    fechaDesde,
    setFechaDesde,
  ] = useState("");
  const [
    fechaHasta,
    setFechaHasta,
  ] = useState("");

  const [
    resumen,
    setResumen,
  ] =
    useState<ResumenReporteOrdenesIndependiente | null>(
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
    useMemo<FiltrosReporteOrdenesIndependiente>(
      () => ({
        buscar:
          buscar.trim(),
        estado,
        anioOrden:
          anioOrden
            ? Number(
                anioOrden,
              )
            : null,
        periodoAnio:
          periodoAnio
            ? Number(
                periodoAnio,
              )
            : null,
        fechaDesde,
        fechaHasta,
      }),
      [
        buscar,
        estado,
        anioOrden,
        periodoAnio,
        fechaDesde,
        fechaHasta,
      ],
    );

  async function consultar(
    filtrosAplicados:
      FiltrosReporteOrdenesIndependiente,
  ): Promise<void> {
    try {
      setConsultando(true);
      setError(null);

      const resultado =
        await obtenerReporteOrdenesIndependiente(
          filtrosAplicados,
        );

      setResumen(
        resultado,
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
      estado: "",
      anioOrden: null,
      periodoAnio: null,
      fechaDesde: "",
      fechaHasta: "",
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
    setEstado("");
    setAnioOrden("");
    setPeriodoAnio("");
    setFechaDesde("");
    setFechaHasta("");
    setMensaje(null);

    await consultar({
      buscar: "",
      estado: "",
      anioOrden: null,
      periodoAnio: null,
      fechaDesde: "",
      fechaHasta: "",
    });
  }

  async function accesoRapido(
    nuevoEstado:
      EstadoReporteOrdenes,
  ): Promise<void> {
    setEstado(
      nuevoEstado,
    );
    setMensaje(null);

    await consultar({
      ...filtros,
      estado:
        nuevoEstado,
    });
  }

  async function descargar():
  Promise<void> {
    try {
      setDescargando(true);
      setError(null);
      setMensaje(null);

      const nombre =
        await descargarReporteOrdenesIndependiente(
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
    <main className="pagina-reportes">
      <header className="reportes-cabecera">
        <div>
          <p className="pagina-etiqueta">
            Reportes
          </p>

          <h1>
            Reporte independiente de Órdenes
          </h1>

          <p>
            Consulta y exporta únicamente las Órdenes vinculadas a la versión
            independiente activa, respetando los filtros seleccionados.
          </p>
        </div>

        {resumen && (
          <aside className="reportes-version">
            <span>
              Versión independiente activa
            </span>

            <strong>
              #{resumen.versionActiva.id}
            </strong>

            <small>
              {resumen.versionActiva.archivo
                ?.nombreArchivo ??
                "Sin archivo registrado"}
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
        <div className="reportes-alerta reportes-alerta-error">
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
        <div className="reportes-alerta reportes-alerta-exito">
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

      <section className="reportes-panel-filtros">
        <div className="reportes-panel-titulo">
          <div>
            <h2>
              Filtros del reporte
            </h2>

            <p>
              Busca por número de orden, ID de origen, DNI/RUC, contribuyente,
              dirección o placa.
            </p>
          </div>

          <button
            className="reportes-boton-secundario"
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
          className="reportes-formulario reportes-formulario-ordenes"
          onSubmit={
            aplicarFiltros
          }
        >
          <label className="reportes-campo reportes-campo-busqueda">
            <span>
              Buscar
            </span>

            <input
              type="search"
              value={buscar}
              placeholder="Orden, DNI/RUC, nombre, dirección o placa"
              onChange={(evento) =>
                setBuscar(
                  evento.target
                    .value,
                )
              }
            />
          </label>

          <label className="reportes-campo">
            <span>
              Estado
            </span>

            <select
              value={estado}
              onChange={(evento) =>
                setEstado(
                  evento.target
                    .value as
                    | EstadoReporteOrdenes
                    | "",
                )
              }
            >
              <option value="">
                Todos
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

          <label className="reportes-campo">
            <span>
              Año de orden
            </span>

            <input
              type="number"
              min="1900"
              max="2100"
              value={anioOrden}
              placeholder="Todos"
              onChange={(evento) =>
                setAnioOrden(
                  evento.target
                    .value,
                )
              }
            />
          </label>

          <label className="reportes-campo">
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

          <label className="reportes-campo">
            <span>
              Emisión desde
            </span>

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

          <label className="reportes-campo">
            <span>
              Emisión hasta
            </span>

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

          <button
            className="reportes-boton-aplicar"
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

        <div className="reportes-accesos-rapidos">
          <span>
            Accesos rápidos:
          </span>

          {ESTADOS.map(
            (opcion) => (
              <button
                key={
                  opcion.valor
                }
                type="button"
                disabled={
                  consultando ||
                  descargando
                }
                onClick={() =>
                  void accesoRapido(
                    opcion.valor,
                  )
                }
              >
                {
                  opcion.etiqueta
                }
              </button>
            ),
          )}
        </div>
      </section>

      {consultando &&
      !resumen ? (
        <section className="reportes-cargando">
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
          <section className="reportes-resumen-grid reportes-resumen-grid-ampliado">
            <article>
              <span>
                Órdenes
              </span>

              <strong>
                {
                  resumen.totales
                    .ordenes
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
                Contribuyentes
              </span>

              <strong>
                {
                  resumen.totales
                    .contribuyentes
                }
              </strong>
            </article>

            <article>
              <span>
                Importe generado
              </span>

              <strong>
                {moneda(
                  resumen.totales
                    .importeTotal,
                )}
              </strong>
            </article>

            <article>
              <span>
                Total pagado
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
                Saldo pendiente
              </span>

              <strong>
                {moneda(
                  resumen.totales
                    .saldo,
                )}
              </strong>
            </article>
          </section>

          <section className="reportes-resultados">
            <header>
              <div>
                <h2>
                  Resumen por estado
                </h2>

                <p>
                  La exportación utiliza los mismos filtros y la misma versión
                  activa mostrada en pantalla.
                </p>
              </div>

              <button
                className="reportes-boton-descargar"
                type="button"
                disabled={
                  descargando ||
                  consultando ||
                  resumen.totales
                    .ordenes === 0
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

            {resumen.totales
              .ordenes === 0 ? (
              <div className="reportes-sin-resultados">
                <strong>
                  No existen Órdenes con estos filtros
                </strong>

                <p>
                  Cambia los criterios antes de generar el archivo.
                </p>
              </div>
            ) : (
              <div className="reportes-tabla-contenedor">
                <table className="reportes-tabla">
                  <thead>
                    <tr>
                      <th>
                        Estado
                      </th>
                      <th>
                        Órdenes
                      </th>
                      <th>
                        Importe
                      </th>
                      <th>
                        Pagado
                      </th>
                      <th>
                        Saldo
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {resumen.estados.map(
                      (fila) => (
                        <tr
                          key={
                            fila.estado
                          }
                        >
                          <td>
                            <span
                              className={`reportes-estado reportes-estado-${fila.estado.toLowerCase()}`}
                            >
                              {etiquetaEstado(
                                fila.estado,
                              )}
                            </span>
                          </td>

                          <td>
                            {
                              fila.cantidad
                            }
                          </td>

                          <td>
                            {moneda(
                              fila.importeTotal,
                            )}
                          </td>

                          <td>
                            {moneda(
                              fila.totalPagado,
                            )}
                          </td>

                          <td>
                            {moneda(
                              fila.saldo,
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

          <section className="reportes-resultados reportes-vista-previa">
            <header>
              <div>
                <h2>
                  Vista previa
                </h2>

                <p>
                  Se muestran hasta 50 Órdenes. El Excel contiene todos los
                  resultados que coinciden con los filtros.
                </p>
              </div>

              <span className="reportes-contador-vista">
                {
                  resumen.muestra
                    .length
                }{" "}
                visibles
              </span>
            </header>

            {resumen.muestra.length ===
            0 ? (
              <div className="reportes-sin-resultados">
                Sin registros para mostrar.
              </div>
            ) : (
              <div className="reportes-tabla-contenedor">
                <table className="reportes-tabla reportes-tabla-vista">
                  <thead>
                    <tr>
                      <th>
                        Orden
                      </th>
                      <th>
                        Emisión
                      </th>
                      <th>
                        DNI/RUC
                      </th>
                      <th>
                        Contribuyente
                      </th>
                      <th>
                        Placa
                      </th>
                      <th>
                        Periodos
                      </th>
                      <th>
                        Importe
                      </th>
                      <th>
                        Pagado
                      </th>
                      <th>
                        Saldo
                      </th>
                      <th>
                        Estado
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {resumen.muestra.map(
                      (orden) => (
                        <tr
                          key={
                            orden.id
                          }
                        >
                          <td>
                            <strong>
                              {
                                orden.anioOrden
                              }
                              -
                              {
                                orden.numeroOrden
                              }
                            </strong>
                          </td>

                          <td>
                            {fechaSimple(
                              orden.fechaEmision,
                            )}
                          </td>

                          <td>
                            {orden.dniRuc ??
                              "—"}
                          </td>

                          <td>
                            {orden.nombre ??
                              "—"}
                          </td>

                          <td>
                            {orden.placa ??
                              "—"}
                          </td>

                          <td>
                            {
                              orden.periodos
                            }
                          </td>

                          <td>
                            {moneda(
                              orden.importeTotal,
                            )}
                          </td>

                          <td>
                            {moneda(
                              orden.totalPagado,
                            )}
                          </td>

                          <td>
                            {moneda(
                              orden.saldo,
                            )}
                          </td>

                          <td>
                            <span
                              className={`reportes-estado reportes-estado-${orden.estado.toLowerCase()}`}
                            >
                              {etiquetaEstado(
                                orden.estado,
                              )}
                            </span>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="reportes-contenido-excel">
            <h2>
              Contenido del archivo Excel
            </h2>

            <div>
              <article>
                <strong>
                  Resumen
                </strong>

                <p>
                  Versión activa, archivo de origen, filtros, totales y
                  distribución por estado.
                </p>
              </article>

              <article>
                <strong>
                  Órdenes
                </strong>

                <p>
                  Datos del contribuyente, placa, importes, estado, archivo y
                  fila de origen.
                </p>
              </article>

              <article>
                <strong>
                  Periodos y pagos
                </strong>

                <p>
                  Trimestres, declaración vinculada, recibos activos, pagos,
                  saldos y observaciones.
                </p>
              </article>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
