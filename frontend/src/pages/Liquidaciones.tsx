import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  obtenerLiquidacionPorId,
  obtenerLiquidaciones,
  obtenerResumenLiquidaciones,
  type EstadoConciliacionLiquidacion,
  type LiquidacionCompleta,
  type LiquidacionResumen,
  type PaginacionLiquidaciones,
  type ResumenLiquidaciones,
} from "../liquidaciones-api";
import "./Liquidaciones.css";

const ESTADOS: Array<{
  valor:
    EstadoConciliacionLiquidacion;
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
    EstadoConciliacionLiquidacion,
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

function descripcionEstado(
  estado:
    EstadoConciliacionLiquidacion,
): string {
  switch (estado) {
    case "PAGADO":
      return "Cobertura completa de los periodos.";
    case "PAGO_PARCIAL":
      return "Faltan uno o más trimestres.";
    case "PENDIENTE":
      return "Sin pagos activos reconocidos.";
    case "SIN_DECLARACION":
      return "No existe declaración coincidente.";
    case "PAGO_ANULADO":
      return "Solo existen recibos anulados.";
    case "ANULADO":
      return "Liquidación anulada en el origen.";
    case "REVISAR":
      return "La conciliación requiere validación.";
    case "SOBREPAGO":
      return "Pago superior registrado.";
  }
}

function EtiquetaEstado({
  estado,
}: {
  estado:
    EstadoConciliacionLiquidacion;
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

function ModalDetalleLiquidacion({
  liquidacion,
  alCerrar,
}: {
  liquidacion:
    LiquidacionCompleta;
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
        <header className="modal-cabecera modal-liquidacion-cabecera">
          <div>
            <p className="modal-subtitulo">
              Liquidación tributaria
            </p>

            <h2>
              {
                liquidacion
                  .anioLiquidacion
              }
              -
              {
                liquidacion
                  .numeroLiquidacion
              }
            </h2>

            <p>
              {liquidacion.placa ??
                "Sin placa"}{" "}
              ·{" "}
              {liquidacion.nombre ??
                "Sin nombre"}
            </p>
          </div>

          <div className="modal-cabecera-acciones">
            <EtiquetaEstado
              estado={
                liquidacion.estado
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
                Total liquidación
              </span>
              <strong>
                {moneda(
                  liquidacion
                    .importeTotal,
                )}
              </strong>
            </div>

            <div>
              <span>Total pagado</span>
              <strong>
                {moneda(
                  liquidacion
                    .totalPagado,
                )}
              </strong>
            </div>

            <div className="resumen-pagos-sisgat">
              <span>
                Pagos aplicados a esta
                liquidación
              </span>
              <strong>
                {
                  liquidacion
                    .pagosAplicadosLiquidacion
                }
              </strong>
            </div>

            <div>
              <span>
                Fecha de emisión
              </span>
              <strong>
                {fecha(
                  liquidacion
                    .fechaEmision,
                )}
              </strong>
            </div>
          </section>

          <section className="historial-pagos-sisgat">
            <div className="historial-pagos-principal">
              <span>
                Historial completo de pagos
                SisGAT
              </span>

              <strong>
                {
                  liquidacion
                    .historialPagosSisgat
                }
              </strong>
            </div>

            <div
              className={
                liquidacion
                  .pagosFueraLiquidacion ===
                "Sin pagos fuera de esta liquidación"
                  ? "pagos-fuera pagos-fuera-vacio"
                  : "pagos-fuera"
              }
            >
              <span>
                Pagos fuera de esta
                liquidación
              </span>

              <strong>
                {
                  liquidacion
                    .pagosFueraLiquidacion
                }
              </strong>

              {liquidacion
                .pagosFueraLiquidacion !==
                "Sin pagos fuera de esta liquidación" && (
                <small>
                  Se muestran como antecedente.
                  No se utilizan para completar
                  otros años de esta liquidación.
                </small>
              )}
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
                  {liquidacion.dniRuc ??
                    "No registrado"}
                </strong>
              </div>

              <div>
                <span>
                  Nombre o razón social
                </span>
                <strong>
                  {liquidacion.nombre ??
                    "No registrado"}
                </strong>
              </div>

              <div>
                <span>Placa</span>
                <strong>
                  {liquidacion.placa ??
                    "No registrada"}
                </strong>
              </div>

              <div>
                <span>Dirección</span>
                <strong>
                  {liquidacion
                    .direccion ??
                    "No registrada"}
                </strong>
              </div>

              <div>
                <span>
                  Estado original
                </span>
                <strong>
                  {liquidacion
                    .estadoOriginal ??
                    "No registrado"}
                </strong>
              </div>

              <div>
                <span>
                  Referencia vehicular
                </span>
                <strong>
                  {liquidacion.anioRVeh &&
                  liquidacion.numeroRVeh
                    ? `${liquidacion.anioRVeh}-${liquidacion.numeroRVeh}`
                    : "No registrada"}
                </strong>
              </div>
            </div>
          </section>

          <section className="bloque-informacion">
            <h3>
              Periodos de la liquidación
            </h3>

            <div className="periodos-lista">
              {liquidacion.detalles.map(
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

                    <div className="periodo-montos periodo-cobertura-grid">
                      <div>
                        <span>
                          Total del periodo
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
                          Monto registrado
                        </span>
                        <strong>
                          {moneda(
                            detalle
                              .montoPagado,
                          )}
                        </strong>
                      </div>

                      <div className="periodo-pagos-sisgat">
                        <span>
                          Pago aplicado al
                          periodo
                        </span>
                        <strong>
                          {
                            detalle
                              .pagosSisgat
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Cobertura
                        </span>
                        <strong>
                          {
                            detalle
                              .cantidadTrimestresCubiertos
                          }{" "}
                          de{" "}
                          {
                            detalle
                              .cantidadTrimestresSolicitados
                          }{" "}
                          trimestre(s)
                        </strong>

                        <small>
                          {detalle
                            .coberturaCompleta
                            ? "Cobertura completa"
                            : `Faltan: [${detalle.trimestresFaltantes}]`}
                        </small>
                      </div>
                    </div>

                    <div className="liquidacion-calculo-grid">
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

                    {Math.abs(
                      detalle
                        .diferenciaMontoInformativa,
                    ) > 0.05 && (
                      <div className="diferencia-informativa">
                        <strong>
                          Diferencia de monto
                        </strong>

                        <p>
                          {detalle
                            .diferenciaMontoInformativa >
                          0
                            ? `El monto registrado es menor al liquidado en ${moneda(
                                detalle
                                  .diferenciaMontoInformativa,
                              )}.`
                            : `El monto registrado supera al liquidado en ${moneda(
                                Math.abs(
                                  detalle
                                    .diferenciaMontoInformativa,
                                ),
                              )}.`}{" "}
                          Esta diferencia es
                          informativa y no se
                          interpreta
                          automáticamente como
                          deuda.
                        </p>
                      </div>
                    )}

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

function Liquidaciones() {
  const [
    resumen,
    setResumen,
  ] = useState<
    ResumenLiquidaciones | null
  >(null);

  const [
    liquidaciones,
    setLiquidaciones,
  ] = useState<
    LiquidacionResumen[]
  >([]);

  const [
    paginacion,
    setPaginacion,
  ] = useState<PaginacionLiquidaciones>({
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
    | EstadoConciliacionLiquidacion
    | ""
  >("");

  const [
    anioLiquidacion,
    setAnioLiquidacion,
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
    LiquidacionCompleta | null
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
          await obtenerResumenLiquidaciones();

        setResumen(resultado);
      } catch (errorDesconocido) {
        setError(
          errorDesconocido instanceof
            Error
            ? errorDesconocido.message
            : "No se pudo cargar el resumen de liquidaciones.",
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
          await obtenerLiquidaciones({
            buscar: busqueda,
            estado,
            anioLiquidacion:
              anioLiquidacion.trim() ===
              ""
                ? null
                : Number(
                    anioLiquidacion,
                  ),
            periodoAnio:
              periodoAnio.trim() ===
              ""
                ? null
                : Number(periodoAnio),
            pagina,
            limite: 10,
          });

        setLiquidaciones(
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
            : "No se pudieron cargar las liquidaciones.",
        );
      } finally {
        setCargandoLista(false);
      }
    }, [
      anioLiquidacion,
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
            ?.liquidacionesPorEstado
            .find(
              (registro) =>
                registro.estado ===
                item.valor,
            );

        return {
          ...item,
          cantidad:
            dato?.cantidad ?? 0,
          descripcion:
            descripcionEstado(
              item.valor,
            ),
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
    setAnioLiquidacion("");
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
        await obtenerLiquidacionPorId(
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
          : "No se pudo cargar el detalle de la liquidación.",
      );
    } finally {
      setCargandoDetalle(false);
    }
  }

  function filtrarPorEstado(
    nuevoEstado:
      | EstadoConciliacionLiquidacion
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
            Liquidaciones y pagos
            tributarios
          </h1>

          <p className="cabecera-descripcion">
            Consulta las liquidaciones,
            los periodos tributarios y
            los recibos asociados sin
            alterar el módulo de órdenes.
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
          titulo="Liquidaciones"
          valor={
            cargandoResumen
              ? "..."
              : (resumen
                  ?.totalLiquidaciones ??
                0)
          }
          descripcion="Documentos cargados en la versión activa."
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
          descripcion="Monto total de las liquidaciones."
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
          titulo="Pagadas por cobertura"
          valor={
            cargandoResumen
              ? "..."
              : (resumen
                  ?.liquidacionesPorEstado
                  .find(
                    (item) =>
                      item.estado ===
                      "PAGADO",
                  )
                  ?.cantidad ?? 0)
          }
          descripcion="Todos los trimestres solicitados tienen pagos activos."
        />
      </section>

      <section className="estados-grid liquidaciones-estados-grid">
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
                {item.descripcion}
              </small>
            </button>
          ),
        )}
      </section>

      <section className="panel-ordenes">
        <header className="panel-cabecera">
          <div>
            <h2>
              Consulta de liquidaciones
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
                    | EstadoConciliacionLiquidacion
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
              Año de liquidación
            </span>

            <input
              type="number"
              min="2000"
              max="2100"
              value={anioLiquidacion}
              onChange={(evento) =>
                setAnioLiquidacion(
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
          <table className="tabla-ordenes tabla-liquidaciones">
            <thead>
              <tr>
                <th>Liquidación</th>
                <th>Contribuyente</th>
                <th>Placa</th>
                <th>Periodos</th>
                <th>Importe</th>
                <th>Pagado</th>
                <th>Historial pagos SisGAT</th>
                <th>Estado</th>
                <th>Detalle</th>
              </tr>
            </thead>

            <tbody>
              {cargandoLista ? (
                <tr>
                  <td
                    className="tabla-mensaje"
                    colSpan={9}
                  >
                    Cargando
                    liquidaciones...
                  </td>
                </tr>
              ) : liquidaciones.length ===
                0 ? (
                <tr>
                  <td
                    className="tabla-mensaje"
                    colSpan={9}
                  >
                    No se encontraron
                    liquidaciones con los
                    filtros seleccionados.
                  </td>
                </tr>
              ) : (
                liquidaciones.map(
                  (liquidacion) => (
                    <tr
                      key={
                        liquidacion.id
                      }
                    >
                      <td>
                        <strong>
                          {
                            liquidacion
                              .anioLiquidacion
                          }
                          -
                          {
                            liquidacion
                              .numeroLiquidacion
                          }
                        </strong>

                        <small>
                          {fecha(
                            liquidacion
                              .fechaEmision,
                          )}
                        </small>
                      </td>

                      <td>
                        <strong>
                          {liquidacion
                            .nombre ??
                            "Sin nombre"}
                        </strong>

                        <small>
                          {liquidacion
                            .dniRuc ??
                            "Sin DNI/RUC"}
                        </small>
                      </td>

                      <td>
                        <strong>
                          {liquidacion
                            .placa ??
                            "—"}
                        </strong>
                      </td>

                      <td>
                        {liquidacion
                          .periodo ??
                          "—"}

                        <small>
                          {
                            liquidacion
                              .cantidadDetalles
                          }{" "}
                          detalle(s)
                        </small>
                      </td>

                      <td>
                        {moneda(
                          liquidacion
                            .importeTotal,
                        )}
                      </td>

                      <td>
                        {moneda(
                          liquidacion
                            .totalPagado,
                        )}
                      </td>

                      <td className="tabla-pagos-sisgat">
                        <strong>
                          {
                            liquidacion
                              .historialPagosSisgat
                          }
                        </strong>

                        <small>
                          Aplicados:{" "}
                          {
                            liquidacion
                              .pagosAplicadosLiquidacion
                          }
                        </small>

                        {liquidacion
                          .pagosFueraLiquidacion !==
                          "Sin pagos fuera de esta liquidación" && (
                          <small className="tabla-pagos-fuera">
                            Fuera:{" "}
                            {
                              liquidacion
                                .pagosFueraLiquidacion
                            }
                          </small>
                        )}
                      </td>

                      <td>
                        <EtiquetaEstado
                          estado={
                            liquidacion
                              .estado
                          }
                        />
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
                              liquidacion.id,
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
        <ModalDetalleLiquidacion
          liquidacion={
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

export default Liquidaciones;
