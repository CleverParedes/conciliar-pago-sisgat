import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  obtenerRequerimientoPorId,
  obtenerRequerimientos,
  obtenerResumenRequerimientos,
  type EstadoConciliacionRequerimiento,
  type RequerimientoCompleta,
  type RequerimientoResumen,
  type PaginacionRequerimientos,
  type ResumenRequerimientos,
} from "../requerimientos-api";
import { PagosSisgatCelda } from "../components/PagosSisgatCelda";
import "./Requerimientos.css";

const ESTADOS: Array<{
  valor:
    EstadoConciliacionRequerimiento;
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
    valor: "REVISAR",
    etiqueta: "Revisar",
  },
  {
    valor: "SOBREPAGO",
    etiqueta: "Sobrepago",
  },
];

const formatoMoneda =
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  });

function moneda(
  valor: number,
): string {
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
  estado:
    EstadoConciliacionRequerimiento,
): string {
  const coincidencia =
    ESTADOS.find(
      (item) =>
        item.valor === estado,
    );

  return (
    coincidencia?.etiqueta ??
    estado
      .replaceAll("_", " ")
      .toLowerCase()
  );
}

function EtiquetaEstado({
  estado,
}: {
  estado:
    EstadoConciliacionRequerimiento;
}) {
  return (
    <span
      className={`estado estado-${estado.toLowerCase()}`}
    >
      {nombreEstado(estado)}
    </span>
  );
}

function TarjetaResumen({
  titulo,
  valor,
  descripcion,
}: {
  titulo: string;
  valor: string | number;
  descripcion: string;
}) {
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

function ModalDetalleRequerimiento({
  requerimiento,
  alCerrar,
}: {
  requerimiento:
    RequerimientoCompleta;
  alCerrar: () => void;
}) {
  useEffect(() => {
    function manejarTecla(
      evento: KeyboardEvent,
    ): void {
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
        <header className="modal-cabecera modal-requerimiento-cabecera">
          <div>
            <p className="modal-subtitulo">
              Requerimiento tributario
            </p>

            <h2>
              {
                requerimiento
                  .anioRequerimiento
              }
              -
              {
                requerimiento
                  .numeroRequerimiento
              }
            </h2>

            <p>
              {requerimiento.placa ??
                "Sin placa"}{" "}
              ·{" "}
              {requerimiento.nombre ??
                "Sin nombre"}
            </p>
          </div>

          <div className="modal-cabecera-acciones">
            <EtiquetaEstado
              estado={
                requerimiento.estado
              }
            />

            <button
              className="boton-cerrar"
              type="button"
              onClick={alCerrar}
              aria-label="Cerrar detalle"
            >
              ×
            </button>
          </div>
        </header>

        <div className="modal-cuerpo">
          <section className="detalle-resumen">
            <div>
              <span>
                Total requerimiento
              </span>
              <strong>
                {moneda(
                  requerimiento
                    .importeTotal,
                )}
              </strong>
            </div>

            <div>
              <span>Total pagado</span>
              <strong>
                {moneda(
                  requerimiento
                    .totalPagado,
                )}
              </strong>
            </div>

            <div>
              <span>
                Saldo por pagar
              </span>
              <strong>
                {moneda(
                  requerimiento.saldo,
                )}
              </strong>
            </div>

            <div>
              <span>
                Fecha de emisión
              </span>
              <strong>
                {fecha(
                  requerimiento
                    .fechaEmision,
                )}
              </strong>
            </div>
          </section>

          <section className="bloque-informacion">
            <h3>
              Datos del contribuyente
            </h3>

            <div className="informacion-grid">
              <div>
                <span>DNI/RUC</span>
                <strong>
                  {requerimiento.dniRuc ??
                    "No registrado"}
                </strong>
              </div>

              <div>
                <span>
                  Nombre o razón social
                </span>
                <strong>
                  {requerimiento.nombre ??
                    "No registrado"}
                </strong>
              </div>

              <div>
                <span>Placa</span>
                <strong>
                  {requerimiento.placa ??
                    "No registrada"}
                </strong>
              </div>

              <div>
                <span>Dirección</span>
                <strong>
                  {requerimiento
                    .direccion ??
                    "No registrada"}
                </strong>
              </div>

              <div>
                <span>
                  Estado original
                </span>
                <strong>
                  {requerimiento
                    .estadoOriginal ??
                    "No registrado"}
                </strong>
              </div>

            </div>
          </section>

          <section className="bloque-informacion">
            <h3>
              Periodos del requerimiento
            </h3>

            <div className="periodos-lista">
              {requerimiento.detalles.map(
                (detalle) => (
                  <article
                    className="periodo"
                    key={detalle.id}
                  >
                    <header className="periodo-cabecera">
                      <div>
                        <h4>
                          {
                            detalle
                              .periodoAnio
                          }{" "}
                          [
                          {
                            detalle
                              .trimestreDesde
                          }
                          -
                          {
                            detalle
                              .trimestreHasta
                          }
                          ]
                        </h4>

                        <p>
                          {detalle
                            .periodoOriginal ??
                            "Periodo sin texto original"}
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
                            detalle
                              .totalPeriodo,
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Monto pagado
                        </span>
                        <strong>
                          {moneda(
                            detalle
                              .montoPagado,
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Saldo por pagar
                        </span>
                        <strong>
                          {moneda(
                            detalle.saldo,
                          )}
                        </strong>
                      </div>
                    </div>

                    <div className="requerimiento-calculo-grid">
                      <div>
                        <span>
                          Valor referencial
                        </span>
                        <strong>
                          {detalle
                            .valorReferencial ===
                          null
                            ? "—"
                            : moneda(
                                detalle
                                  .valorReferencial,
                              )}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Base imponible
                        </span>
                        <strong>
                          {detalle
                            .baseImponible ===
                          null
                            ? "—"
                            : moneda(
                                detalle
                                  .baseImponible,
                              )}
                        </strong>
                      </div>

                      <div>
                        <span>Impuesto</span>
                        <strong>
                          {detalle.impuesto ===
                          null
                            ? "—"
                            : moneda(
                                detalle
                                  .impuesto,
                              )}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Interés y reajuste
                        </span>
                        <strong>
                          {moneda(
                            (detalle.interes ??
                              0) +
                              (detalle
                                .reajuste ??
                                0),
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
                            detalle
                              .observacion
                          }
                        </p>
                      </div>
                    )}

                    <section className="declaracion">
                      <h5>
                        Declaración y recibos
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
                                    <th>Recibo</th>
                                    <th>
                                      Trimestre
                                    </th>
                                    <th>Monto</th>
                                    <th>Estado</th>
                                  </tr>
                                </thead>

                                <tbody>
                                  {detalle.declaracion.recibos.map(
                                    (recibo) => (
                                      <tr
                                        key={
                                          recibo.id
                                        }
                                      >
                                        <td>
                                          {
                                            recibo
                                              .anioRecibo
                                          }
                                          -
                                          {
                                            recibo
                                              .numeroRecibo
                                          }
                                        </td>

                                        <td>
                                          {recibo
                                            .trimestre ??
                                            "—"}
                                        </td>

                                        <td>
                                          {moneda(
                                            recibo
                                              .monto,
                                          )}
                                        </td>

                                        <td>
                                          <span
                                            className={
                                              recibo
                                                .activo
                                                ? "recibo-activo"
                                                : "recibo-inactivo"
                                            }
                                          >
                                            {recibo
                                              .estadoOriginal ??
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

function Requerimientos() {
  const [
    resumen,
    setResumen,
  ] = useState<
    ResumenRequerimientos | null
  >(null);

  const [
    requerimientos,
    setRequerimientos,
  ] = useState<
    RequerimientoResumen[]
  >([]);

  const [
    paginacion,
    setPaginacion,
  ] = useState<PaginacionRequerimientos>({
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
    | EstadoConciliacionRequerimiento
    | ""
  >("");

  const [
    anioRequerimiento,
    setAnioRequerimiento,
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
    cargandoResumen,
    setCargandoResumen,
  ] = useState(true);

  const [
    cargandoLista,
    setCargandoLista,
  ] = useState(true);

  const [
    cargandoDetalle,
    setCargandoDetalle,
  ] = useState(false);

  const [
    detalleSeleccionado,
    setDetalleSeleccionado,
  ] = useState<
    RequerimientoCompleta | null
  >(null);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  const cargarResumen =
    useCallback(async () => {
      try {
        setCargandoResumen(true);

        const resultado =
          await obtenerResumenRequerimientos();

        setResumen(resultado);
      } catch (errorDesconocido) {
        setError(
          errorDesconocido instanceof
            Error
            ? errorDesconocido.message
            : "No se pudo cargar el resumen de requerimientos.",
        );
      } finally {
        setCargandoResumen(false);
      }
    }, []);

  const cargarLista =
    useCallback(async () => {
      try {
        setCargandoLista(true);
        setError(null);

        const resultado =
          await obtenerRequerimientos({
            buscar: busqueda,
            estado,
            anioRequerimiento:
              anioRequerimiento.trim() ===
              ""
                ? null
                : Number(
                    anioRequerimiento,
                  ),
            periodoAnio:
              periodoAnio.trim() ===
              ""
                ? null
                : Number(periodoAnio),
            pagina,
            limite: 10,
          });

        setRequerimientos(
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
            : "No se pudieron cargar los requerimientos.",
        );
      } finally {
        setCargandoLista(false);
      }
    }, [
      anioRequerimiento,
      busqueda,
      estado,
      pagina,
      periodoAnio,
    ]);

  useEffect(() => {
    void cargarResumen();
  }, [cargarResumen]);

  useEffect(() => {
    void cargarLista();
  }, [cargarLista]);

  const resumenEstados = useMemo(
    () =>
      ESTADOS.map((item) => {
        const dato =
          resumen
            ?.requerimientosPorEstado
            .find(
              (registro) =>
                registro.estado ===
                item.valor,
            );

        return {
          ...item,
          cantidad:
            dato?.cantidad ?? 0,
          saldo:
            dato?.saldo ?? 0,
        };
      }),
    [resumen],
  );

  function buscar(
    evento: FormEvent,
  ): void {
    evento.preventDefault();
    setPagina(1);
    setBusqueda(
      textoBusqueda.trim(),
    );
  }

  function limpiarFiltros():
  void {
    setTextoBusqueda("");
    setBusqueda("");
    setEstado("");
    setAnioRequerimiento("");
    setPeriodoAnio("");
    setPagina(1);
  }

  async function abrirDetalle(
    id: number,
  ): Promise<void> {
    try {
      setCargandoDetalle(true);
      setError(null);

      const resultado =
        await obtenerRequerimientoPorId(
          id,
        );

      setDetalleSeleccionado(
        resultado,
      );
    } catch (errorDesconocido) {
      setError(
        errorDesconocido instanceof
          Error
          ? errorDesconocido.message
          : "No se pudo cargar el detalle del requerimiento.",
      );
    } finally {
      setCargandoDetalle(false);
    }
  }

  function filtrarPorEstado(
    nuevoEstado:
      | EstadoConciliacionRequerimiento
      | "",
  ): void {
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
            Requerimientos y pagos
            tributarios
          </h1>

          <p className="cabecera-descripcion">
            Consulta los requerimientos,
            sus periodos tributarios y
            los recibos asociados sin
            alterar los módulos de órdenes
            y liquidaciones.
          </p>
        </div>

        <button
          className="boton-secundario"
          type="button"
          disabled={
            cargandoResumen ||
            cargandoLista
          }
          onClick={() => {
            void cargarResumen();
            void cargarLista();
          }}
        >
          Actualizar
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
          titulo="Requerimientos"
          valor={
            cargandoResumen
              ? "..."
              : (resumen
                  ?.totalRequerimientos ??
                0)
          }
          descripcion="Requerimientos cargados en la versión activa."
        />

        <TarjetaResumen
          titulo="Importe total"
          valor={
            cargandoResumen
              ? "..."
              : moneda(
                  resumen?.montos
                    .importeTotal ?? 0,
                )
          }
          descripcion="Monto total de los requerimientos."
        />

        <TarjetaResumen
          titulo="Total pagado"
          valor={
            cargandoResumen
              ? "..."
              : moneda(
                  resumen?.montos
                    .totalPagado ?? 0,
                )
          }
          descripcion="Pagos asociados mediante conciliación."
        />

        <TarjetaResumen
          titulo="Saldo pendiente"
          valor={
            cargandoResumen
              ? "..."
              : moneda(
                  resumen?.montos
                    .saldo ?? 0,
                )
          }
          descripcion="Saldo calculado de manera independiente."
        />
      </section>

      <section className="estados-grid requerimientos-estados-grid">
        {resumenEstados.map(
          (item) => (
            <button
              className={`estado-tarjeta ${
                estado === item.valor
                  ? "estado-tarjeta-activa"
                  : ""
              }`}
              type="button"
              key={item.valor}
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
                Saldo:{" "}
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
              Consulta de requerimientos
            </h2>

            <p>
              Busca por número, DNI/RUC,
              nombre, placa o
              identificador original.
            </p>
          </div>

          <strong>
            {paginacion.total} registros
          </strong>
        </header>

        <form
          className="filtros"
          onSubmit={buscar}
        >
          <label className="campo">
            <span>Búsqueda general</span>

            <input
              value={textoBusqueda}
              onChange={(evento) =>
                setTextoBusqueda(
                  evento.target.value,
                )
              }
              placeholder="Número, DNI/RUC, nombre o placa"
            />
          </label>

          <label className="campo">
            <span>Estado</span>

            <select
              value={estado}
              onChange={(evento) => {
                setEstado(
                  evento.target
                    .value as
                    | EstadoConciliacionRequerimiento
                    | "",
                );
                setPagina(1);
              }}
            >
              <option value="">
                Todos
              </option>

              {ESTADOS.map((item) => (
                <option
                  value={item.valor}
                  key={item.valor}
                >
                  {item.etiqueta}
                </option>
              ))}
            </select>
          </label>

          <label className="campo">
            <span>
              Año del requerimiento
            </span>

            <input
              type="number"
              min="2000"
              max="2100"
              value={anioRequerimiento}
              onChange={(evento) =>
                setAnioRequerimiento(
                  evento.target.value,
                )
              }
              placeholder="2026"
            />
          </label>

          <label className="campo">
            <span>Año del periodo</span>

            <input
              type="number"
              min="2000"
              max="2100"
              value={periodoAnio}
              onChange={(evento) =>
                setPeriodoAnio(
                  evento.target.value,
                )
              }
              placeholder="2025"
            />
          </label>

          <div className="filtros-acciones">
            <button
              className="boton-primario"
              type="submit"
              disabled={cargandoLista}
            >
              Buscar
            </button>

            <button
              className="boton-ligero"
              type="button"
              onClick={limpiarFiltros}
              disabled={cargandoLista}
            >
              Limpiar
            </button>
          </div>
        </form>

        <div className="tabla-contenedor">
          <table className="tabla-ordenes tabla-requerimientos">
            <thead>
              <tr>
                <th>Requerimiento</th>
                <th>Contribuyente</th>
                <th>Placa</th>
                <th>Periodos</th>
                <th>Importe</th>
                <th>Pagado</th>
                <th>Saldo</th>
                <th>Pagos SisGAT</th>
                <th>Estado</th>
                <th>Periodo tributario</th>
                <th>3 años pagados</th>
                <th>Detalle</th>
              </tr>
            </thead>

            <tbody>
              {cargandoLista ? (
                <tr>
                  <td
                    className="tabla-mensaje"
                    colSpan={12}
                  >
                    Cargando
                    requerimientos...
                  </td>
                </tr>
              ) : requerimientos.length ===
                0 ? (
                <tr>
                  <td
                    className="tabla-mensaje"
                    colSpan={12}
                  >
                    No se encontraron
                    requerimientos con los
                    filtros seleccionados.
                  </td>
                </tr>
              ) : (
                requerimientos.map(
                  (requerimiento) => (
                    <tr
                      key={
                        requerimiento.id
                      }
                    >
                      <td>
                        <strong>
                          {
                            requerimiento
                              .anioRequerimiento
                          }
                          -
                          {
                            requerimiento
                              .numeroRequerimiento
                          }
                        </strong>

                        <small>
                          {fecha(
                            requerimiento
                              .fechaEmision,
                          )}
                        </small>
                      </td>

                      <td>
                        <strong>
                          {requerimiento
                            .nombre ??
                            "Sin nombre"}
                        </strong>

                        <small>
                          {requerimiento
                            .dniRuc ??
                            "Sin DNI/RUC"}
                        </small>
                      </td>

                      <td>
                        <strong>
                          {requerimiento
                            .placa ??
                            "—"}
                        </strong>
                      </td>

                      <td>
                        {requerimiento
                          .periodo ??
                          "—"}

                        <small>
                          {
                            requerimiento
                              .cantidadDetalles
                          }{" "}
                          detalle(s)
                        </small>
                      </td>

                      <td>
                        {moneda(
                          requerimiento
                            .importeTotal,
                        )}
                      </td>

                      <td>
                        {moneda(
                          requerimiento
                            .totalPagado,
                        )}
                      </td>

                      <td>
                        {moneda(
                          requerimiento
                            .saldo,
                        )}
                      </td>

                      <td>
                        <PagosSisgatCelda
                          pagos={
                            requerimiento
                              .pagosSisgat ??
                            []
                          }
                        />
                      </td>

                      <td>
                        <EtiquetaEstado
                          estado={
                            requerimiento
                              .estado
                          }
                        />
                      </td>

                      <td>
                        <div>
                          <strong>
                            Inscripción:{" "}
                            {requerimiento
                              .anioInscripcion ??
                              "—"}
                          </strong>
                          <small>
                            Último pago esperado:{" "}
                            {requerimiento
                              .anioUltimoTributario ??
                              "—"}
                          </small>
                        </div>
                      </td>

                      <td>
                        <strong>
                          {requerimiento
                            .tresAniosPagados ===
                          null
                            ? "—"
                            : requerimiento
                                .tresAniosPagados
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
                              requerimiento.id,
                            )
                          }
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ),
                )
              )}
            </tbody>
          </table>
        </div>

        <footer className="paginacion">
          <button
            type="button"
            disabled={
              pagina <= 1 ||
              cargandoLista
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
              paginacion
                .totalPaginas,
              1,
            )}
          </span>

          <button
            type="button"
            disabled={
              pagina >=
                paginacion
                  .totalPaginas ||
              cargandoLista ||
              paginacion
                .totalPaginas === 0
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
        <ModalDetalleRequerimiento
          requerimiento={
            detalleSeleccionado
          }
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

export default Requerimientos;
