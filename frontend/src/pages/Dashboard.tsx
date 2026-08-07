import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  obtenerDashboard,
  obtenerOrdenes,
  obtenerOrdenPorId,
} from "../api";
import type {
  DashboardData,
  EstadoConciliacion,
  OrdenCompleta,
  OrdenResumen,
  Paginacion,
} from "../types";
import { PagosSisgatCelda } from "../components/PagosSisgatCelda";

const ESTADOS: Array<{
  valor: EstadoConciliacion;
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
    valor: "REVISAR",
    etiqueta: "Revisar",
  },
];

const formatoMoneda =
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  });

function moneda(valor: number): string {
  return formatoMoneda.format(
    Number(valor ?? 0),
  );
}

function fecha(
  valor: string | null,
): string {
  if (!valor) {
    return "—";
  }

  return new Date(
    valor,
  ).toLocaleDateString("es-PE", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function nombreEstado(
  estado: EstadoConciliacion,
): string {
  const coincidencia =
    ESTADOS.find(
      (item) => item.valor === estado,
    );

  if (coincidencia) {
    return coincidencia.etiqueta;
  }

  return estado
    .replaceAll("_", " ")
    .toLowerCase();
}

function claseEstado(
  estado: EstadoConciliacion,
): string {
  return `estado estado-${estado.toLowerCase()}`;
}

interface EtiquetaEstadoProps {
  estado: EstadoConciliacion;
}

function EtiquetaEstado({
  estado,
}: EtiquetaEstadoProps) {
  return (
    <span className={claseEstado(estado)}>
      {nombreEstado(estado)}
    </span>
  );
}

interface TarjetaResumenProps {
  titulo: string;
  valor: string | number;
  descripcion: string;
}

function TarjetaResumen({
  titulo,
  valor,
  descripcion,
}: TarjetaResumenProps) {
  return (
    <article className="tarjeta-resumen">
      <p className="tarjeta-titulo">
        {titulo}
      </p>

      <strong className="tarjeta-valor">
        {valor}
      </strong>

      <p className="tarjeta-descripcion">
        {descripcion}
      </p>
    </article>
  );
}

interface ModalDetalleProps {
  orden: OrdenCompleta;
  alCerrar: () => void;
}

function ModalDetalle({
  orden,
  alCerrar,
}: ModalDetalleProps) {
  useEffect(() => {
    function manejarTecla(
      evento: KeyboardEvent,
    ) {
      if (evento.key === "Escape") {
        alCerrar();
      }
    }

    window.addEventListener(
      "keydown",
      manejarTecla,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        manejarTecla,
      );
    };
  }, [alCerrar]);

  return (
    <div
      className="modal-fondo"
      onMouseDown={alCerrar}
    >
      <section
        className="modal-contenido"
        onMouseDown={(evento) =>
          evento.stopPropagation()
        }
      >
        <header className="modal-cabecera">
          <div>
            <p className="modal-subtitulo">
              Orden de pago
            </p>

            <h2>
              {orden.anioOrden}-
              {orden.numeroOrden}
            </h2>

            <p>
              {orden.placa} ·{" "}
              {orden.nombre}
            </p>
          </div>

          <div className="modal-cabecera-acciones">
            <EtiquetaEstado
              estado={orden.estado}
            />

            <button
              className="boton-cerrar"
              onClick={alCerrar}
              type="button"
              aria-label="Cerrar detalle"
            >
              ×
            </button>
          </div>
        </header>

        <div className="modal-cuerpo">
          <section className="detalle-resumen">
            <div>
              <span>Total orden</span>
              <strong>
                {moneda(
                  orden.importeTotal,
                )}
              </strong>
            </div>

            <div>
              <span>Total pagado</span>
              <strong>
                {moneda(
                  orden.totalPagado,
                )}
              </strong>
            </div>

            <div>
              <span>Saldo por Pagar</span>
              <strong>
                {moneda(orden.saldo)}
              </strong>
            </div>

            <div>
              <span>Fecha de emisión</span>
              <strong>
                {fecha(
                  orden.fechaEmision,
                )}
              </strong>
            </div>
          </section>

          <section className="bloque-informacion">
            <h3>Contribuyente</h3>

            <div className="informacion-grid">
              <div>
                <span>DNI/RUC</span>
                <strong>
                  {orden.dniRuc}
                </strong>
              </div>

              <div>
                <span>
                  Nombre o razón social
                </span>
                <strong>
                  {orden.nombre}
                </strong>
              </div>

              <div>
                <span>Placa</span>
                <strong>
                  {orden.placa}
                </strong>
              </div>

              <div>
                <span>Dirección</span>
                <strong>
                  {orden.direccion ??
                    "No registrada"}
                </strong>
              </div>
            </div>
          </section>

          <section className="bloque-informacion">
            <h3>
              Periodos de la orden
            </h3>

            <div className="periodos-lista">
              {orden.detalles.map(
                (detalle) => (
                  <article
                    className="periodo"
                    key={detalle.id}
                  >
                    <header className="periodo-cabecera">
                      <div>
                        <h4>
                          {detalle.periodoAnio}{" "}
                          [
                          {
                            detalle.trimestreDesde
                          }
                          -
                          {
                            detalle.trimestreHasta
                          }
                          ]
                        </h4>

                        <p>
                          {
                            detalle.periodoOriginal
                          }
                        </p>
                      </div>

                      <EtiquetaEstado
                        estado={
                          detalle.estado
                        }
                      />
                    </header>

                    <div className="periodo-montos">
                      <div>
                        <span>
                          Total periodo
                        </span>
                        <strong>
                          {moneda(
                            detalle.totalPeriodo,
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Monto pagado
                        </span>
                        <strong>
                          {moneda(
                            detalle.montoPagado,
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>Saldo por pagar</span>
                        <strong>
                          {moneda(
                            detalle.saldo,
                          )}
                        </strong>
                      </div>
                    </div>

                    {detalle.observacion && (
                      <div className="observacion">
                        <strong>
                          Observación
                        </strong>
                        <p>
                          {
                            detalle.observacion
                          }
                        </p>
                      </div>
                    )}

                    <section className="declaracion">
                      <h5>
                        Declaración y
                        recibos
                      </h5>

                      {!detalle.declaracion ? (
                        <p className="sin-datos">
                          No existe una
                          declaración vinculada
                          automáticamente.
                        </p>
                      ) : (
                        <>
                          <div className="declaracion-datos">
                            <span>
                              Declaración:
                            </span>

                            <strong>
                              {
                                detalle
                                  .declaracion
                                  .anioDeclaracion
                              }
                              -
                              {
                                detalle
                                  .declaracion
                                  .numeroDeclaracion
                              }
                            </strong>
                          </div>

                          {detalle.declaracion
                            .recibos.length ===
                          0 ? (
                            <p className="sin-datos">
                              La declaración no
                              tiene recibos.
                            </p>
                          ) : (
                            <div className="tabla-contenedor tabla-recibos">
                              <table>
                                <thead>
                                  <tr>
                                    <th>
                                      Recibo
                                    </th>
                                    <th>
                                      Trimestre
                                    </th>
                                    <th>
                                      Monto
                                    </th>
                                    <th>
                                      Estado
                                    </th>
                                  </tr>
                                </thead>

                                <tbody>
                                  {detalle.declaracion.recibos.map(
                                    (
                                      recibo,
                                    ) => (
                                      <tr
                                        key={
                                          recibo.id
                                        }
                                      >
                                        <td>
                                          {
                                            recibo.anioRecibo
                                          }
                                          -
                                          {
                                            recibo.numeroRecibo
                                          }
                                        </td>

                                        <td>
                                          {recibo.trimestre ??
                                            "—"}
                                        </td>

                                        <td>
                                          {moneda(
                                            recibo.monto,
                                          )}
                                        </td>

                                        <td>
                                          <span
                                            className={
                                              recibo.activo
                                                ? "recibo-activo"
                                                : "recibo-inactivo"
                                            }
                                          >
                                            {recibo.estadoOriginal ??
                                              "Sin estado"}
                                          </span>
                                        </td>
                                      </tr>
                                    ),
                                  )}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </>
                      )}
                    </section>
                  </article>
                ),
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function Dashboard() {
  const [
    dashboard,
    setDashboard,
  ] = useState<DashboardData | null>(
    null,
  );

  const [
    ordenes,
    setOrdenes,
  ] = useState<OrdenResumen[]>([]);

  const [
    paginacion,
    setPaginacion,
  ] = useState<Paginacion>({
    pagina: 1,
    limite: 10,
    total: 0,
    totalPaginas: 0,
  });

  const [
    textoBusqueda,
    setTextoBusqueda,
  ] = useState("");

  const [
    busqueda,
    setBusqueda,
  ] = useState("");

  const [
    estado,
    setEstado,
  ] = useState<
    EstadoConciliacion | ""
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
    pagina,
    setPagina,
  ] = useState(1);

  const [
    cargandoDashboard,
    setCargandoDashboard,
  ] = useState(true);

  const [
    cargandoOrdenes,
    setCargandoOrdenes,
  ] = useState(true);

  const [
    cargandoDetalle,
    setCargandoDetalle,
  ] = useState(false);

  const [
    detalleSeleccionado,
    setDetalleSeleccionado,
  ] = useState<OrdenCompleta | null>(
    null,
  );

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  const cargarDashboard =
    useCallback(async () => {
      try {
        setCargandoDashboard(true);

        const resultado =
          await obtenerDashboard();

        setDashboard(resultado);
      } catch (errorDesconocido) {
        setError(
          errorDesconocido instanceof
            Error
            ? errorDesconocido.message
            : "No se pudo cargar el dashboard.",
        );
      } finally {
        setCargandoDashboard(false);
      }
    }, []);

  const cargarOrdenes =
    useCallback(async () => {
      try {
        setCargandoOrdenes(true);
        setError(null);

        const resultado =
          await obtenerOrdenes({
            buscar: busqueda,
            estado,
            anioOrden:
              anioOrden.trim() === ""
                ? null
                : Number(anioOrden),
            periodoAnio:
              periodoAnio.trim() === ""
                ? null
                : Number(periodoAnio),
            pagina,
            limite: 10,
          });

        setOrdenes(
          resultado.registros,
        );

        setPaginacion(
          resultado.paginacion,
        );
      } catch (errorDesconocido) {
        setError(
          errorDesconocido instanceof
            Error
            ? errorDesconocido.message
            : "No se pudieron cargar las órdenes.",
        );
      } finally {
        setCargandoOrdenes(false);
      }
    }, [
      anioOrden,
      busqueda,
      estado,
      pagina,
      periodoAnio,
    ]);

  useEffect(() => {
    void cargarDashboard();
  }, [cargarDashboard]);

  useEffect(() => {
    void cargarOrdenes();
  }, [cargarOrdenes]);

  const resumenEstados = useMemo(
    () =>
      ESTADOS.map((item) => {
        const resumen =
          dashboard?.ordenesPorEstado.find(
            (registro) =>
              registro.estado ===
              item.valor,
          );

        return {
          ...item,
          cantidad:
            resumen?.cantidad ?? 0,
          saldo: resumen?.saldo ?? 0,
        };
      }),
    [dashboard],
  );

  function buscarOrdenes(
    evento: FormEvent,
  ) {
    evento.preventDefault();
    setPagina(1);
    setBusqueda(
      textoBusqueda.trim(),
    );
  }

  function limpiarFiltros() {
    setTextoBusqueda("");
    setBusqueda("");
    setEstado("");
    setAnioOrden("");
    setPeriodoAnio("");
    setPagina(1);
  }

  async function abrirDetalle(
    id: number,
  ) {
    try {
      setCargandoDetalle(true);
      setError(null);

      const resultado =
        await obtenerOrdenPorId(id);

      setDetalleSeleccionado(
        resultado,
      );
    } catch (errorDesconocido) {
      setError(
        errorDesconocido instanceof
          Error
          ? errorDesconocido.message
          : "No se pudo cargar el detalle.",
      );
    } finally {
      setCargandoDetalle(false);
    }
  }

  function filtrarPorEstado(
    nuevoEstado:
      | EstadoConciliacion
      | "",
  ) {
    setEstado(nuevoEstado);
    setPagina(1);
  }

  return (
    <main className="aplicacion">
      <header className="cabecera-principal">
        <div>
          <p className="cabecera-etiqueta">
            Sistema de conciliación
          </p>

          <h1>
            Órdenes y pagos
            tributarios
          </h1>

          <p className="cabecera-descripcion">
            Consulta el estado de las
            órdenes de pago y sus
            recibos asociados.
          </p>
        </div>

        <button
          className="boton-secundario"
          type="button"
          onClick={() => {
            void cargarDashboard();
            void cargarOrdenes();
          }}
        >
          Actualizar datos
        </button>
      </header>

      {error && (
        <div className="mensaje-error">
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

      <section className="resumen-principal">
        <TarjetaResumen
          titulo="Órdenes registradas"
          valor={
            cargandoDashboard
              ? "..."
              : dashboard
                  ?.totalOrdenes ?? 0
          }
          descripcion="Total importado"
        />

        <TarjetaResumen
          titulo="Contribuyentes"
          valor={
            cargandoDashboard
              ? "..."
              : dashboard
                  ?.totalContribuyentes ??
                0
          }
          descripcion="Personas y empresas"
        />

        <TarjetaResumen
          titulo="Importe generado"
          valor={
            cargandoDashboard
              ? "..."
              : moneda(
                  dashboard?.montos
                    .importeTotal ?? 0,
                )
          }
          descripcion="Monto total de órdenes"
        />

        <TarjetaResumen
          titulo="Por Pagar"
          valor={
            cargandoDashboard
              ? "..."
              : moneda(
                  dashboard?.montos
                    .saldo ?? 0,
                )
          }
          descripcion="Monto por pagar"
        />
      </section>

      <section className="estados-grid">
        {resumenEstados.map(
          (item) => (
            <button
              className={`estado-tarjeta ${
                estado === item.valor
                  ? "estado-tarjeta-activa"
                  : ""
              }`}
              key={item.valor}
              type="button"
              onClick={() =>
                filtrarPorEstado(
                  estado === item.valor
                    ? ""
                    : item.valor,
                )
              }
            >
              <EtiquetaEstado
                estado={item.valor}
              />

              <strong>
                {item.cantidad}
              </strong>

              <small>
                Saldo por pagar:{" "}
                {moneda(item.saldo)}
              </small>
            </button>
          ),
        )}
      </section>

      <section className="panel-ordenes">
        <header className="panel-cabecera">
          <div>
            <h2>
              Consulta de órdenes
            </h2>

            <p>
              Busca por placa, DNI/RUC,
              nombre o número de orden.
            </p>
          </div>

          <strong>
            {paginacion.total} registro
            {paginacion.total === 1
              ? ""
              : "s"}
          </strong>
        </header>

        <form
          className="filtros"
          onSubmit={buscarOrdenes}
        >
          <label className="campo campo-busqueda">
            <span>Buscar</span>

            <input
              type="search"
              value={textoBusqueda}
              onChange={(evento) =>
                setTextoBusqueda(
                  evento.target.value,
                )
              }
              placeholder="Ejemplo: AUC-378, 41301320 o Lizares"
            />
          </label>

          <label className="campo">
            <span>Estado</span>

            <select
              value={estado}
              onChange={(evento) =>
                filtrarPorEstado(
                  evento.target
                    .value as
                    | EstadoConciliacion
                    | "",
                )
              }
            >
              <option value="">
                Todos
              </option>

              {ESTADOS.map(
                (item) => (
                  <option
                    value={item.valor}
                    key={item.valor}
                  >
                    {item.etiqueta}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="campo">
            <span>Año de orden</span>

            <input
              type="number"
              value={anioOrden}
              onChange={(evento) => {
                setAnioOrden(
                  evento.target.value,
                );
                setPagina(1);
              }}
              placeholder="2026"
            />
          </label>

          <label className="campo">
            <span>
              Año del periodo
            </span>

            <input
              type="number"
              value={periodoAnio}
              onChange={(evento) => {
                setPeriodoAnio(
                  evento.target.value,
                );
                setPagina(1);
              }}
              placeholder="2021"
            />
          </label>

          <div className="filtros-acciones">
            <button
              className="boton-primario"
              type="submit"
            >
              Buscar
            </button>

            <button
              className="boton-ligero"
              type="button"
              onClick={limpiarFiltros}
            >
              Limpiar
            </button>
          </div>
        </form>

        <div className="tabla-contenedor">
          <table className="tabla-ordenes">
            <thead>
              <tr>
                <th>Orden</th>
                <th>Contribuyente</th>
                <th>Placa</th>
                <th>Periodo</th>
                <th>Total</th>
                <th>Pagado</th>
                <th>Por Pagar</th>
                <th>Pagos SisGAT</th>
                <th>Estado</th>
                <th>Periodo tributario</th>
                <th>3 años pagados</th>
                <th />
              </tr>
            </thead>

            <tbody>
              {cargandoOrdenes ? (
                <tr>
                  <td
                    colSpan={12}
                    className="tabla-mensaje"
                  >
                    Cargando órdenes...
                  </td>
                </tr>
              ) : ordenes.length ===
                0 ? (
                <tr>
                  <td
                    colSpan={12}
                    className="tabla-mensaje"
                  >
                    No se encontraron
                    órdenes con los filtros
                    seleccionados.
                  </td>
                </tr>
              ) : (
                ordenes.map((orden) => (
                  <tr key={orden.id}>
                    <td>
                      <strong>
                        {orden.anioOrden}-
                        {
                          orden.numeroOrden
                        }
                      </strong>

                      <small>
                        {fecha(
                          orden.fechaEmision,
                        )}
                      </small>
                    </td>

                    <td>
                      <strong>
                        {orden.nombre}
                      </strong>

                      <small>
                        {orden.dniRuc}
                      </small>
                    </td>

                    <td>
                      <strong>
                        {orden.placa}
                      </strong>
                    </td>

                    <td>
                      {orden.periodo}
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
                      <PagosSisgatCelda
                        pagos={
                          orden.pagosSisgat ??
                          []
                        }
                      />
                    </td>

                    <td>
                      <EtiquetaEstado
                        estado={
                          orden.estado
                        }
                      />
                    </td>

                    <td>
                      <div>
                        <strong>
                          Inscripción:{" "}
                          {orden.anioInscripcion ??
                            "—"}
                        </strong>
                        <small>
                          Último pago esperado:{" "}
                          {orden.anioUltimoTributario ??
                            "—"}
                        </small>
                      </div>
                    </td>

                    <td>
                      <strong>
                        {orden.tresAniosPagados ===
                        null
                          ? "—"
                          : orden.tresAniosPagados
                            ? "SÍ"
                            : "NO"}
                      </strong>
                    </td>

                    <td>
                      <button
                        className="boton-ver"
                        type="button"
                        disabled={
                          cargandoDetalle
                        }
                        onClick={() =>
                          void abrirDetalle(
                            orden.id,
                          )
                        }
                      >
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <footer className="paginacion">
          <button
            type="button"
            disabled={
              pagina <= 1 ||
              cargandoOrdenes
            }
            onClick={() =>
              setPagina((actual) =>
                Math.max(
                  actual - 1,
                  1,
                ),
              )
            }
          >
            Anterior
          </button>

          <span>
            Página{" "}
            {paginacion.pagina} de{" "}
            {Math.max(
              paginacion.totalPaginas,
              1,
            )}
          </span>

          <button
            type="button"
            disabled={
              pagina >=
                paginacion.totalPaginas ||
              cargandoOrdenes ||
              paginacion.totalPaginas ===
                0
            }
            onClick={() =>
              setPagina(
                (actual) =>
                  actual + 1,
              )
            }
          >
            Siguiente
          </button>
        </footer>
      </section>

      {cargandoDetalle && (
        <div className="cargando-detalle">
          Cargando detalle...
        </div>
      )}

      {detalleSeleccionado && (
        <ModalDetalle
          orden={detalleSeleccionado}
          alCerrar={() =>
            setDetalleSeleccionado(
              null,
            )
          }
        />
      )}
    </main>
  );
}

export default Dashboard;
