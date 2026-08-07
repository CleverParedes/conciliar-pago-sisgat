import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { PagosSisgatCelda } from "../components/PagosSisgatCelda";

import {
  descargarReporteRequerimientosSisgat,
  obtenerReporteRequerimientosSisgat,
  type EstadoReporteRequerimientosSisgat,
  type FiltrosReporteRequerimientosSisgat,
  type ResumenReporteRequerimientosSisgat,
} from "../reportes-requerimientos-sisgat-api";

import "./ReporteRequerimientosSisgat.css";

const ESTADOS: Array<{
  valor: EstadoReporteRequerimientosSisgat;
  etiqueta: string;
}> = [
  { valor: "PAGADO", etiqueta: "Pagado" },
  { valor: "PAGO_PARCIAL", etiqueta: "Pago parcial" },
  { valor: "PENDIENTE", etiqueta: "Pendiente" },
  { valor: "SIN_DECLARACION", etiqueta: "Sin declaración" },
  { valor: "PAGO_ANULADO", etiqueta: "Pago anulado" },
  { valor: "ANULADO", etiqueta: "Anulado" },
  { valor: "SOBREPAGO", etiqueta: "Sobrepago" },
  { valor: "REVISAR", etiqueta: "Revisar" },
];

const formatoMoneda = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  minimumFractionDigits: 2,
});

function moneda(valor: number): string {
  return formatoMoneda.format(Number(valor ?? 0));
}

function fechaHora(valor: string | null): string {
  if (!valor) {
    return "Sin registro";
  }

  const fecha = new Date(valor);

  if (Number.isNaN(fecha.getTime())) {
    return "Fecha no válida";
  }

  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(fecha);
}

function fechaSimple(valor: string | null): string {
  if (!valor) {
    return "—";
  }

  const fecha = new Date(valor);

  if (Number.isNaN(fecha.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeZone: "UTC",
  }).format(fecha);
}

function mensajeError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado.";
}

function etiquetaEstado(
  estado: EstadoReporteRequerimientosSisgat,
): string {
  return (
    ESTADOS.find((item) => item.valor === estado)?.etiqueta ??
    estado.replaceAll("_", " ")
  );
}

export default function ReporteRequerimientosSisgat() {
  const [buscar, setBuscar] = useState("");
  const [estado, setEstado] =
    useState<EstadoReporteRequerimientosSisgat | "">("");
  const [anioRequerimiento, setAnioRequerimiento] = useState("");
  const [periodoAnio, setPeriodoAnio] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const [resumen, setResumen] =
    useState<ResumenReporteRequerimientosSisgat | null>(null);
  const [consultando, setConsultando] = useState(true);
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const filtros = useMemo<FiltrosReporteRequerimientosSisgat>(
    () => ({
      buscar: buscar.trim(),
      estado,
      anioRequerimiento: anioRequerimiento
        ? Number(anioRequerimiento)
        : null,
      periodoAnio: periodoAnio ? Number(periodoAnio) : null,
      fechaDesde,
      fechaHasta,
    }),
    [
      buscar,
      estado,
      anioRequerimiento,
      periodoAnio,
      fechaDesde,
      fechaHasta,
    ],
  );

  async function consultar(
    filtrosAplicados: FiltrosReporteRequerimientosSisgat,
  ): Promise<void> {
    try {
      setConsultando(true);
      setError(null);

      setResumen(
        await obtenerReporteRequerimientosSisgat(filtrosAplicados),
      );
    } catch (errorEncontrado) {
      setError(mensajeError(errorEncontrado));
    } finally {
      setConsultando(false);
    }
  }

  useEffect(() => {
    void consultar({
      buscar: "",
      estado: "",
      anioRequerimiento: null,
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
    await consultar(filtros);
  }

  async function limpiar(): Promise<void> {
    setBuscar("");
    setEstado("");
    setAnioRequerimiento("");
    setPeriodoAnio("");
    setFechaDesde("");
    setFechaHasta("");
    setMensaje(null);

    await consultar({
      buscar: "",
      estado: "",
      anioRequerimiento: null,
      periodoAnio: null,
      fechaDesde: "",
      fechaHasta: "",
    });
  }

  async function accesoRapido(
    nuevoEstado: EstadoReporteRequerimientosSisgat,
  ): Promise<void> {
    setEstado(nuevoEstado);
    setMensaje(null);

    await consultar({
      ...filtros,
      estado: nuevoEstado,
    });
  }

  async function descargar(): Promise<void> {
    try {
      setDescargando(true);
      setError(null);
      setMensaje(null);

      const nombre =
        await descargarReporteRequerimientosSisgat(filtros);

      setMensaje(`El archivo ${nombre} se descargó correctamente.`);
    } catch (errorDescarga) {
      setError(mensajeError(errorDescarga));
    } finally {
      setDescargando(false);
    }
  }

  return (
    <main className="reporte-req-sisgat">
      <header className="reporte-req-sisgat-cabecera">
        <div>
          <p className="pagina-etiqueta">Reportes</p>

          <h1>Reporte independiente de Requerimientos SisGAT</h1>

          <p>
            Consulta y exporta únicamente los Requerimientos del reporte
            oficial vinculados a su versión independiente activa.
          </p>
        </div>

        {resumen && (
          <aside className="reporte-req-sisgat-version">
            <span>Versión independiente activa</span>
            <strong>#{resumen.versionActiva.id}</strong>
            <small>
              {resumen.versionActiva.archivo?.nombreArchivo ??
                "Sin archivo registrado"}
            </small>
            <small>
              Aplicada:{" "}
              {fechaHora(resumen.versionActiva.fechaAplicacion)}
            </small>
          </aside>
        )}
      </header>

      {error && (
        <div className="reporte-req-sisgat-alerta reporte-req-sisgat-alerta-error">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}

      {mensaje && (
        <div className="reporte-req-sisgat-alerta reporte-req-sisgat-alerta-exito">
          <span>{mensaje}</span>
          <button type="button" onClick={() => setMensaje(null)}>
            ×
          </button>
        </div>
      )}

      <section className="reporte-req-sisgat-panel">
        <div className="reporte-req-sisgat-panel-cabecera">
          <div>
            <h2>Filtros del reporte</h2>
            <p>
              Busca por número de requerimiento, ID de origen, DNI/RUC,
              contribuyente, dirección o placa.
            </p>
          </div>

          <button
            className="reporte-req-sisgat-boton-secundario"
            type="button"
            disabled={consultando || descargando}
            onClick={() => void limpiar()}
          >
            Limpiar filtros
          </button>
        </div>

        <form
          className="reporte-req-sisgat-formulario"
          onSubmit={aplicarFiltros}
        >
          <label className="reporte-req-sisgat-campo reporte-req-sisgat-busqueda">
            <span>Buscar</span>
            <input
              type="search"
              value={buscar}
              placeholder="Requerimiento, DNI/RUC, nombre, dirección o placa"
              onChange={(evento) => setBuscar(evento.target.value)}
            />
          </label>

          <label className="reporte-req-sisgat-campo">
            <span>Estado</span>
            <select
              value={estado}
              onChange={(evento) =>
                setEstado(
                  evento.target.value as
                    | EstadoReporteRequerimientosSisgat
                    | "",
                )
              }
            >
              <option value="">Todos</option>
              {ESTADOS.map((opcion) => (
                <option key={opcion.valor} value={opcion.valor}>
                  {opcion.etiqueta}
                </option>
              ))}
            </select>
          </label>

          <label className="reporte-req-sisgat-campo">
            <span>Año del requerimiento</span>
            <input
              type="number"
              min="1900"
              max="2100"
              value={anioRequerimiento}
              placeholder="Todos"
              onChange={(evento) =>
                setAnioRequerimiento(evento.target.value)
              }
            />
          </label>

          <label className="reporte-req-sisgat-campo">
            <span>Año del periodo</span>
            <input
              type="number"
              min="1900"
              max="2100"
              value={periodoAnio}
              placeholder="Todos"
              onChange={(evento) => setPeriodoAnio(evento.target.value)}
            />
          </label>

          <label className="reporte-req-sisgat-campo">
            <span>Emisión desde</span>
            <input
              type="date"
              value={fechaDesde}
              onChange={(evento) => setFechaDesde(evento.target.value)}
            />
          </label>

          <label className="reporte-req-sisgat-campo">
            <span>Emisión hasta</span>
            <input
              type="date"
              value={fechaHasta}
              onChange={(evento) => setFechaHasta(evento.target.value)}
            />
          </label>

          <button
            className="reporte-req-sisgat-boton-aplicar"
            type="submit"
            disabled={consultando || descargando}
          >
            {consultando ? "Consultando..." : "Aplicar filtros"}
          </button>
        </form>

        <div className="reporte-req-sisgat-accesos">
          <span>Accesos rápidos:</span>
          {ESTADOS.map((opcion) => (
            <button
              key={opcion.valor}
              type="button"
              disabled={consultando || descargando}
              onClick={() => void accesoRapido(opcion.valor)}
            >
              {opcion.etiqueta}
            </button>
          ))}
        </div>
      </section>

      {consultando && !resumen ? (
        <section className="reporte-req-sisgat-cargando">
          <div className="sesion-spinner" />
          <strong>Preparando el reporte</strong>
          <span>Consultando la versión independiente activa…</span>
        </section>
      ) : resumen ? (
        <>
          <section className="reporte-req-sisgat-metricas">
            <article>
              <span>Requerimientos</span>
              <strong>{resumen.totales.requerimientos}</strong>
            </article>
            <article>
              <span>Periodos</span>
              <strong>{resumen.totales.periodos}</strong>
            </article>
            <article>
              <span>Contribuyentes</span>
              <strong>{resumen.totales.contribuyentes}</strong>
            </article>
            <article>
              <span>Importe generado</span>
              <strong>{moneda(resumen.totales.importeTotal)}</strong>
            </article>
            <article>
              <span>Total pagado</span>
              <strong>{moneda(resumen.totales.totalPagado)}</strong>
            </article>
            <article>
              <span>Saldo pendiente</span>
              <strong>{moneda(resumen.totales.saldo)}</strong>
            </article>
          </section>

          <section className="reporte-req-sisgat-resultados">
            <header>
              <div>
                <h2>Resumen por estado</h2>
                <p>
                  El Excel utiliza los mismos filtros y la misma versión
                  activa mostrada en pantalla.
                </p>
              </div>

              <button
                className="reporte-req-sisgat-boton-descargar"
                type="button"
                disabled={
                  descargando ||
                  consultando ||
                  resumen.totales.requerimientos === 0
                }
                onClick={() => void descargar()}
              >
                {descargando ? "Generando Excel..." : "Descargar Excel"}
              </button>
            </header>

            {resumen.totales.requerimientos === 0 ? (
              <div className="reporte-req-sisgat-vacio">
                <strong>
                  No existen Requerimientos SisGAT con estos filtros
                </strong>
                <p>Cambia los criterios antes de generar el archivo.</p>
              </div>
            ) : (
              <div className="reporte-req-sisgat-tabla-contenedor">
                <table className="reporte-req-sisgat-tabla">
                  <thead>
                    <tr>
                      <th>Estado</th>
                      <th>Requerimientos</th>
                      <th>Importe</th>
                      <th>Pagado</th>
                      <th>Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.estados.map((fila) => (
                      <tr key={fila.estado}>
                        <td>
                          <span
                            className={`reporte-req-sisgat-estado reporte-req-sisgat-estado-${fila.estado.toLowerCase()}`}
                          >
                            {etiquetaEstado(fila.estado)}
                          </span>
                        </td>
                        <td>{fila.cantidad}</td>
                        <td>{moneda(fila.importeTotal)}</td>
                        <td>{moneda(fila.totalPagado)}</td>
                        <td>{moneda(fila.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="reporte-req-sisgat-resultados">
            <header>
              <div>
                <h2>Vista previa</h2>
                <p>
                  Se muestran hasta 50 Requerimientos. El Excel contiene todos
                  los registros que coincidan con los filtros.
                </p>
              </div>

              <span className="reporte-req-sisgat-contador">
                {resumen.muestra.length} visibles
              </span>
            </header>

            {resumen.muestra.length === 0 ? (
              <div className="reporte-req-sisgat-vacio">
                Sin registros para mostrar.
              </div>
            ) : (
              <div className="reporte-req-sisgat-tabla-contenedor">
                <table className="reporte-req-sisgat-tabla reporte-req-sisgat-tabla-vista">
                  <thead>
                    <tr>
                      <th>Requerimiento</th>
                      <th>Emisión</th>
                      <th>DNI/RUC</th>
                      <th>Contribuyente</th>
                      <th>Placa</th>
                      <th>Pagos SisGAT</th>
                      <th>Periodos</th>
                      <th>Importe</th>
                      <th>Pagado</th>
                      <th>Saldo</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.muestra.map((requerimiento) => (
                      <tr key={requerimiento.id}>
                        <td>
                          <strong>
                            {requerimiento.anioRequerimiento}-
                            {requerimiento.numeroRequerimiento}
                          </strong>
                          <small>
                            {requerimiento.estadoOriginal ??
                              "Sin estado original"}
                          </small>
                        </td>
                        <td>{fechaSimple(requerimiento.fechaEmision)}</td>
                        <td>{requerimiento.dniRuc ?? "—"}</td>
                        <td>{requerimiento.nombre ?? "—"}</td>
                        <td>{requerimiento.placa ?? "—"}</td>
                        <td>
                          <PagosSisgatCelda
                            pagos={requerimiento.pagosSisgat ?? []}
                          />
                        </td>
                        <td>{requerimiento.periodos}</td>
                        <td>{moneda(requerimiento.importeTotal)}</td>
                        <td>{moneda(requerimiento.totalPagado)}</td>
                        <td>{moneda(requerimiento.saldo)}</td>
                        <td>
                          <span
                            className={`reporte-req-sisgat-estado reporte-req-sisgat-estado-${requerimiento.estado.toLowerCase()}`}
                          >
                            {etiquetaEstado(requerimiento.estado)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="reporte-req-sisgat-excel">
            <h2>Contenido del archivo Excel</h2>
            <div>
              <article>
                <strong>Resumen</strong>
                <p>
                  Versión activa, archivo, filtros, métricas y distribución
                  por estado.
                </p>
              </article>
              <article>
                <strong>Requerimientos</strong>
                <p>
                  Contribuyente, dirección, placa, importes, estado y origen
                  del registro oficial.
                </p>
              </article>
              <article>
                <strong>Periodos y pagos</strong>
                <p>
                  Trimestres, conceptos tributarios, declaración vinculada,
                  recibos, pagos, saldos y observaciones.
                </p>
              </article>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
