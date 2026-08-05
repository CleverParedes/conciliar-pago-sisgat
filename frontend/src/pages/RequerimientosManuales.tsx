import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import type {
  RolSesion,
} from "../types";

import {
  actualizarSeguimientoRequerimientoManual,
  obtenerRequerimientoManualPorId,
  obtenerRequerimientosManuales,
  obtenerResumenRequerimientosManuales,
  puedeEditarRequerimientosManuales,
  type ActualizarSeguimientoManual,
  type EstadoConciliacionManual,
  type EstadoNotificacionManual,
  type EstadoRevisionManual,
  type FiltrosRequerimientosManuales,
  type PaginacionManual,
  type RequerimientoManualDetalle,
  type RequerimientoManualResumen,
  type ResumenRequerimientosManuales,
  type TipoRegistroManual,
} from "../requerimientos-manuales-api";

import "./RequerimientosManuales.css";

const TIPOS: Array<{
  valor: TipoRegistroManual;
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
    etiqueta: "Sin registro",
  },
  {
    valor: "ANULADO",
    etiqueta: "Anulado",
  },
];

const ESTADOS: Array<{
  valor:
    EstadoConciliacionManual;
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
  valor: EstadoRevisionManual;
  etiqueta: string;
}> = [
  {
    valor: "COINCIDE",
    etiqueta: "Coincide",
  },
  {
    valor: "DISCREPANCIA",
    etiqueta: "Discrepancia",
  },
  {
    valor: "PENDIENTE",
    etiqueta:
      "Pendiente de revisión",
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
    EstadoNotificacionManual;
  etiqueta: string;
}> = [
  {
    valor: "SIN_ASIGNAR",
    etiqueta: "Sin asignar",
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
    etiqueta: "No notificado",
  },
  {
    valor: "OBSERVADO",
    etiqueta: "Observado",
  },
];

function nombreDesdeLista(
  valor: string,
  lista:
    Array<{
      valor: string;
      etiqueta: string;
    }>,
): string {
  return (
    lista.find(
      (item) =>
        item.valor === valor,
    )?.etiqueta ??
    valor
      .replaceAll("_", " ")
      .toLowerCase()
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
  ).toLocaleDateString(
    "es-PE",
    {
      timeZone: "UTC",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
  );
}

function fechaHora(
  valor: string,
): string {
  return new Date(
    valor,
  ).toLocaleString(
    "es-PE",
  );
}

function fechaInput(
  valor: string | null,
): string {
  return valor
    ? valor.slice(0, 10)
    : "";
}

function moneda(
  valor: number,
): string {
  return new Intl.NumberFormat(
    "es-PE",
    {
      style: "currency",
      currency: "PEN",
    },
  ).format(valor);
}

function Etiqueta({
  valor,
  grupo,
}: {
  valor: string;
  grupo:
    | "conciliado"
    | "revision"
    | "notificacion"
    | "tipo";
}) {
  const lista =
    grupo === "conciliado"
      ? ESTADOS
      : grupo === "revision"
        ? REVISIONES
        : grupo ===
            "notificacion"
          ? NOTIFICACIONES
          : TIPOS;

  return (
    <span
      className={`manual-etiqueta manual-${grupo}-${valor.toLowerCase()}`}
    >
      {nombreDesdeLista(
        valor,
        lista,
      )}
    </span>
  );
}


function EtiquetaValidacionAnios({
  detalle,
}: {
  detalle:
    RequerimientoManualResumen;
}) {
  const analisis =
    detalle.analisisAnios;

  const clase =
    analisis.validacionAnios ===
      "ANIOS_COINCIDEN"
      ? "manual-anios-correctos"
      : analisis
          .puedeMarcarPagadoPorTresAnios
        ? "manual-anios-advertencia"
        : "manual-anios-neutral";

  return (
    <span
      className={`manual-etiqueta-anios ${clase}`}
      title={
        analisis
          .mensajeValidacionAnios
      }
    >
      {
        analisis
          .validacionAniosEtiqueta
      }
    </span>
  );
}

function cantidadEstado(
  resumen:
    ResumenRequerimientosManuales | null,
  grupo:
    | "conciliado"
    | "revision",
  estado: string,
): number {
  const lista =
    grupo === "conciliado"
      ? resumen
          ?.porEstadoConciliado
      : resumen
          ?.porEstadoRevision;

  return (
    lista?.find(
      (item) =>
        item.estado === estado,
    )?.cantidad ?? 0
  );
}

function TarjetaMetrica({
  titulo,
  valor,
  descripcion,
}: {
  titulo: string;
  valor: string | number;
  descripcion: string;
}) {
  return (
    <article className="tarjeta-resumen manual-tarjeta-metrica">
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

function TarjetaEstado({
  estado,
  etiqueta,
  valor,
  descripcion,
  activo,
  alSeleccionar,
}: {
  estado: EstadoConciliacionManual;
  etiqueta: string;
  valor: number;
  descripcion: string;
  activo: boolean;
  alSeleccionar: () => void;
}) {
  return (
    <button
      type="button"
      className={`manual-tarjeta-estado manual-tarjeta-estado-${estado.toLowerCase()}${
        activo
          ? " manual-tarjeta-estado-activa"
          : ""
      }`}
      onClick={alSeleccionar}
      aria-pressed={activo}
      aria-label={`Filtrar por ${etiqueta}`}
      title={`Filtrar por ${etiqueta}`}
    >
      <span className="manual-tarjeta-estado-cabecera">
        <Etiqueta
          grupo="conciliado"
          valor={estado}
        />

        {activo && (
          <span className="manual-filtro-activo">
            Filtro activo
          </span>
        )}
      </span>

      <strong>{valor}</strong>

      <span className="manual-tarjeta-estado-descripcion">
        {descripcion}
      </span>
    </button>
  );
}

type PestanaDetalleManual =
  | "resumen"
  | "conciliacion"
  | "seguimiento"
  | "historial";

interface ModalProps {
  detalle:
    RequerimientoManualDetalle;
  rol: RolSesion;
  alCerrar: () => void;
  alActualizar: (
    detalle:
      RequerimientoManualDetalle,
  ) => void;
}

function ModalDetalle({
  detalle,
  rol,
  alCerrar,
  alActualizar,
}: ModalProps) {
  const puedeEditar =
    puedeEditarRequerimientosManuales(
      rol,
    );

  const [
    pestana,
    setPestana,
  ] = useState<PestanaDetalleManual>(
    "resumen",
  );

  const [
    formulario,
    setFormulario,
  ] = useState<
    ActualizarSeguimientoManual
  >({
    estadoNotificacion:
      detalle
        .estadoNotificacion,
    notificador:
      detalle.notificadorActual,
    responsable:
      detalle.responsableActual,
    numeroLiquidacionDeuda:
      detalle
        .numeroLiquidacionDeudaActual,
    fechaNotificacion:
      fechaInput(
        detalle
          .fechaNotificacionActual,
      ) || null,
    numeroCedulon:
      detalle
        .numeroCedulonActual,
    observacion:
      detalle
        .observacionSeguimiento,
  });

  const [
    guardando,
    setGuardando,
  ] = useState(false);

  const [
    mensaje,
    setMensaje,
  ] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const overflowAnterior =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    function teclado(
      evento: KeyboardEvent,
    ): void {
      if (
        evento.key === "Escape" &&
        !guardando
      ) {
        alCerrar();
      }
    }

    window.addEventListener(
      "keydown",
      teclado,
    );

    return () => {
      document.body.style.overflow =
        overflowAnterior;

      window.removeEventListener(
        "keydown",
        teclado,
      );
    };
  }, [
    alCerrar,
    guardando,
  ]);

  function cambiar(
    campo:
      keyof ActualizarSeguimientoManual,
    valor: string,
  ): void {
    setFormulario(
      (actual) => ({
        ...actual,
        [campo]:
          valor || null,
      }),
    );
  }

  async function guardar(
    evento: FormEvent,
  ): Promise<void> {
    evento.preventDefault();

    try {
      setGuardando(true);
      setMensaje(null);

      const actualizado =
        await actualizarSeguimientoRequerimientoManual(
          detalle.id,
          formulario,
        );

      setFormulario({
        estadoNotificacion:
          actualizado
            .estadoNotificacion,
        notificador:
          actualizado
            .notificadorActual,
        responsable:
          actualizado
            .responsableActual,
        numeroLiquidacionDeuda:
          actualizado
            .numeroLiquidacionDeudaActual,
        fechaNotificacion:
          fechaInput(
            actualizado
              .fechaNotificacionActual,
          ) || null,
        numeroCedulon:
          actualizado
            .numeroCedulonActual,
        observacion:
          actualizado
            .observacionSeguimiento,
      });

      setMensaje(
        "Seguimiento guardado correctamente.",
      );

      alActualizar(
        actualizado,
      );
    } catch (error) {
      setMensaje(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el seguimiento.",
      );
    } finally {
      setGuardando(false);
    }
  }

  const pestanas: Array<{
    id: PestanaDetalleManual;
    etiqueta: string;
    cantidad?: number;
  }> = [
    {
      id: "resumen",
      etiqueta: "Resumen",
    },
    {
      id: "conciliacion",
      etiqueta:
        "Conciliación por año",
      cantidad:
        detalle.periodos.length,
    },
    {
      id: "seguimiento",
      etiqueta: "Seguimiento",
      cantidad:
        detalle.seguimientos.length,
    },
    {
      id: "historial",
      etiqueta: "Historial",
      cantidad:
        detalle.historial.length,
    },
  ];

  return (
    <div
      className="modal-fondo manual-modal-fondo"
      onMouseDown={() => {
        if (!guardando) {
          alCerrar();
        }
      }}
    >
      <section
        className="modal-contenido manual-modal"
        onMouseDown={(evento) =>
          evento.stopPropagation()
        }
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle del requerimiento manual ${detalle.numeroRequerimiento}`}
      >
        <header className="modal-cabecera manual-modal-cabecera">
          <div>
            <p className="modal-subtitulo">
              Requerimiento elaborado
              manualmente
            </p>

            <h2>
              N.°{" "}
              {
                detalle
                  .numeroRequerimiento
              }
            </h2>

            <p>
              {detalle
                .placaNormalizada ??
                detalle.placaOriginal ??
                "Sin placa"}{" "}
              ·{" "}
              {detalle
                .propietarioOriginal ??
                "Sin propietario"}
            </p>
          </div>

          <div className="modal-cabecera-acciones">
            <Etiqueta
              grupo="conciliado"
              valor={
                detalle
                  .estadoConciliado
              }
            />

            <button
              className="boton-cerrar"
              type="button"
              onClick={alCerrar}
              disabled={guardando}
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>
        </header>

        <nav
          className="manual-modal-pestanas"
          aria-label="Secciones del detalle"
        >
          {pestanas.map(
            (item) => (
              <button
                key={item.id}
                type="button"
                className={
                  pestana === item.id
                    ? "manual-modal-pestana manual-modal-pestana-activa"
                    : "manual-modal-pestana"
                }
                onClick={() =>
                  setPestana(item.id)
                }
              >
                {item.etiqueta}

                {item.cantidad !==
                  undefined && (
                  <span>
                    {item.cantidad}
                  </span>
                )}
              </button>
            ),
          )}
        </nav>

        <div className="modal-cuerpo manual-modal-cuerpo">
          {pestana === "resumen" && (
            <div className="manual-pestana-contenido">
              <section className="manual-estados-principales">
                <div>
                  <span>
                    Estado del Excel
                  </span>
                  <strong>
                    {detalle
                      .estadoManualOriginal ??
                      "Sin estado"}
                  </strong>
                </div>

                <div>
                  <span>
                    Estado calculado
                  </span>
                  <Etiqueta
                    grupo="conciliado"
                    valor={
                      detalle
                        .estadoConciliado
                    }
                  />
                </div>

                <div>
                  <span>
                    Comparación
                  </span>
                  <Etiqueta
                    grupo="revision"
                    valor={
                      detalle
                        .estadoRevision
                    }
                  />

                  <EtiquetaValidacionAnios
                    detalle={detalle}
                  />
                </div>

                <div>
                  <span>
                    Notificación
                  </span>
                  <Etiqueta
                    grupo="notificacion"
                    valor={
                      detalle
                        .estadoNotificacion
                    }
                  />
                </div>
              </section>

              <section className="manual-cruce-anios">
                <header>
                  <div>
                    <p>
                      Validación de los años
                    </p>
                    <h3>
                      Cruce del Excel con los pagos SisGAT
                    </h3>
                  </div>

                  <EtiquetaValidacionAnios
                    detalle={detalle}
                  />
                </header>

                <div className="manual-cruce-anios-grid">
                  <div>
                    <span>
                      Años del requerimiento
                    </span>
                    <strong>
                      {detalle
                        .analisisAnios
                        .aniosManual
                        .join(" · ") ||
                        "—"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Historial de pagos SisGAT
                    </span>
                    <strong>
                      {detalle
                        .analisisAnios
                        .historialPagosSisgat}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Tres años pagados
                    </span>
                    <strong>
                      {detalle
                        .analisisAnios
                        .ventanaTresAniosPagadosFormato}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Años tributarios esperados
                    </span>
                    <strong>
                      {detalle
                        .analisisAnios
                        .aniosTributariosEsperadosFormato}
                    </strong>
                  </div>
                </div>

                <p className="manual-cruce-anios-mensaje">
                  {detalle
                    .analisisAnios
                    .mensajeValidacionAnios}
                </p>
              </section>

              <section className="bloque-informacion">
                <h3>
                  Datos originales del Excel
                </h3>

                <div className="informacion-grid manual-informacion-grid">
                  <div>
                    <span>
                      Año de gestión
                    </span>
                    <strong>
                      {
                        detalle
                          .anioGestion
                      }
                    </strong>
                  </div>

                  <div>
                    <span>
                      Fila de origen
                    </span>
                    <strong>
                      {detalle
                        .filaOrigen ??
                        "—"}
                    </strong>
                  </div>

                  <div>
                    <span>Placa</span>
                    <strong>
                      {detalle
                        .placaOriginal ??
                        "—"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Placa normalizada
                    </span>
                    <strong>
                      {detalle
                        .placaNormalizada ??
                        "—"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Fecha del requerimiento
                    </span>
                    <strong>
                      {fecha(
                        detalle
                          .fechaRequerimiento,
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Año del vehículo
                    </span>
                    <strong>
                      {detalle
                        .anioVehiculoOriginal ??
                        "—"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Periodos de deuda
                    </span>
                    <strong>
                      {detalle
                        .deudaOriginal ??
                        "—"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Tipo de registro
                    </span>
                    <Etiqueta
                      grupo="tipo"
                      valor={
                        detalle
                          .tipoRegistro
                      }
                    />
                  </div>

                  <div>
                    <span>Provincia</span>
                    <strong>
                      {detalle
                        .provinciaOriginal ??
                        "—"}
                    </strong>
                  </div>

                  <div>
                    <span>Distrito</span>
                    <strong>
                      {detalle
                        .distritoOriginal ??
                        "—"}
                    </strong>
                  </div>

                  <div className="manual-campo-amplio">
                    <span>Dirección</span>
                    <strong>
                      {detalle
                        .direccionOriginal ??
                        "—"}
                    </strong>
                  </div>

                  <div className="manual-campo-amplio">
                    <span>
                      Observación original
                    </span>
                    <strong>
                      {detalle
                        .observacionesOriginal ??
                        "—"}
                    </strong>
                  </div>
                </div>
              </section>
            </div>
          )}

          {pestana ===
            "conciliacion" && (
            <div className="manual-pestana-contenido">
              <header className="manual-seccion-cabecera">
                <div>
                  <h3>
                    Conciliación por año
                  </h3>
                  <p>
                    Se compara la placa y cada
                    periodo de deuda con las
                    declaraciones y recibos
                    disponibles.
                  </p>
                </div>

                <span className="manual-contador-seccion">
                  {detalle.periodos.length}{" "}
                  periodo(s)
                </span>
              </header>

              <section className="manual-resumen-sisgat">
                <div>
                  <span>
                    Años escritos en el Excel
                  </span>
                  <strong>
                    {detalle
                      .analisisAnios
                      .aniosManual
                      .join(" · ") ||
                      "—"}
                  </strong>
                </div>

                <div>
                  <span>
                    Historial completo de pagos
                  </span>
                  <strong>
                    {detalle
                      .analisisAnios
                      .historialPagosSisgat}
                  </strong>
                </div>

                <div>
                  <span>
                    Resultado de años
                  </span>
                  <EtiquetaValidacionAnios
                    detalle={detalle}
                  />
                </div>
              </section>

              {detalle.periodos.length ===
              0 ? (
                <p className="sin-datos">
                  Este registro no contiene
                  años de deuda extraíbles.
                </p>
              ) : (
                <div className="manual-periodos">
                  {detalle.periodos.map(
                    (periodo) => (
                      <article
                        key={periodo.id}
                        className="manual-periodo"
                      >
                        <header>
                          <div>
                            <h4>
                              {
                                periodo
                                  .periodoAnio
                              }
                            </h4>

                            <p>
                              {periodo
                                .observacion ??
                                "Sin observación"}
                            </p>
                          </div>

                          <Etiqueta
                            grupo="conciliado"
                            valor={
                              periodo
                                .estadoConciliado
                            }
                          />
                        </header>

                        <div className="manual-periodo-resumen">
                          <div>
                            <span>
                              Monto de recibos
                              activos
                            </span>
                            <strong>
                              {moneda(
                                periodo
                                  .montoPagado,
                              )}
                            </strong>
                          </div>

                          <div>
                            <span>
                              Declaración
                            </span>
                            <strong>
                              {periodo
                                .declaracion
                                ? `${periodo.declaracion.anioDeclaracion}-${periodo.declaracion.numeroDeclaracion}`
                                : "No vinculada"}
                            </strong>
                          </div>
                        </div>

                        {periodo
                          .declaracion &&
                          periodo
                            .declaracion
                            .recibos.length >
                            0 && (
                            <div className="tabla-contenedor manual-recibos">
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
                                  {periodo.declaracion.recibos.map(
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
                                            .trimestreOriginal ??
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
                      </article>
                    ),
                  )}
                </div>
              )}
            </div>
          )}

          {pestana ===
            "seguimiento" && (
            <div className="manual-pestana-contenido">
              <header className="manual-seccion-cabecera">
                <div>
                  <h3>
                    Seguimiento operativo
                  </h3>
                  <p>
                    Actualiza la notificación,
                    el responsable, el cedulón y
                    las observaciones sin alterar
                    los datos originales del Excel.
                  </p>
                </div>
              </header>

              {!puedeEditar && (
                <p className="manual-aviso-consulta">
                  El acceso de invitado es
                  únicamente de consulta.
                </p>
              )}

              <form
                className="manual-formulario"
                onSubmit={(evento) =>
                  void guardar(evento)
                }
              >
                <label>
                  Estado de notificación
                  <select
                    value={
                      formulario
                        .estadoNotificacion
                    }
                    disabled={
                      !puedeEditar ||
                      guardando
                    }
                    onChange={(evento) =>
                      setFormulario(
                        (actual) => ({
                          ...actual,
                          estadoNotificacion:
                            evento.target
                              .value as
                              EstadoNotificacionManual,
                        }),
                      )
                    }
                  >
                    {NOTIFICACIONES.map(
                      (item) => (
                        <option
                          key={
                            item.valor
                          }
                          value={
                            item.valor
                          }
                        >
                          {
                            item.etiqueta
                          }
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label>
                  Notificador
                  <input
                    value={
                      formulario
                        .notificador ??
                      ""
                    }
                    disabled={
                      !puedeEditar ||
                      guardando
                    }
                    onChange={(evento) =>
                      cambiar(
                        "notificador",
                        evento.target
                          .value,
                      )
                    }
                  />
                </label>

                <label>
                  Responsable
                  <input
                    value={
                      formulario
                        .responsable ??
                      ""
                    }
                    disabled={
                      !puedeEditar ||
                      guardando
                    }
                    onChange={(evento) =>
                      cambiar(
                        "responsable",
                        evento.target
                          .value,
                      )
                    }
                  />
                </label>

                <label>
                  N.° de liquidación de deuda
                  <input
                    value={
                      formulario
                        .numeroLiquidacionDeuda ??
                      ""
                    }
                    disabled={
                      !puedeEditar ||
                      guardando
                    }
                    onChange={(evento) =>
                      cambiar(
                        "numeroLiquidacionDeuda",
                        evento.target
                          .value,
                      )
                    }
                  />
                </label>

                <label>
                  Fecha de notificación
                  <input
                    type="date"
                    value={
                      formulario
                        .fechaNotificacion ??
                      ""
                    }
                    disabled={
                      !puedeEditar ||
                      guardando
                    }
                    onChange={(evento) =>
                      cambiar(
                        "fechaNotificacion",
                        evento.target
                          .value,
                      )
                    }
                  />
                </label>

                <label>
                  N.° o resultado del cedulón
                  <input
                    value={
                      formulario
                        .numeroCedulon ??
                      ""
                    }
                    disabled={
                      !puedeEditar ||
                      guardando
                    }
                    onChange={(evento) =>
                      cambiar(
                        "numeroCedulon",
                        evento.target
                          .value,
                      )
                    }
                  />
                </label>

                <label className="manual-formulario-observacion">
                  Observación de seguimiento
                  <textarea
                    rows={5}
                    value={
                      formulario
                        .observacion ??
                      ""
                    }
                    disabled={
                      !puedeEditar ||
                      guardando
                    }
                    onChange={(evento) =>
                      cambiar(
                        "observacion",
                        evento.target
                          .value,
                      )
                    }
                  />
                </label>

                {mensaje && (
                  <p className="manual-mensaje-formulario">
                    {mensaje}
                  </p>
                )}

                {puedeEditar && (
                  <div className="manual-formulario-acciones">
                    <button
                      type="submit"
                      className="boton-primario"
                      disabled={
                        guardando
                      }
                    >
                      {guardando
                        ? "Guardando..."
                        : "Guardar seguimiento"}
                    </button>
                  </div>
                )}
              </form>
            </div>
          )}

          {pestana ===
            "historial" && (
            <div className="manual-pestana-contenido">
              <header className="manual-seccion-cabecera">
                <div>
                  <h3>
                    Historial del requerimiento
                  </h3>
                  <p>
                    Consulta los seguimientos y
                    las modificaciones registradas
                    por el sistema.
                  </p>
                </div>
              </header>

              <section className="bloque-informacion manual-bloque-historial">
                <h3>
                  Seguimientos registrados
                </h3>

                {detalle.seguimientos
                  .length === 0 ? (
                  <p className="sin-datos">
                    No existen seguimientos
                    registrados.
                  </p>
                ) : (
                  <div className="manual-linea-tiempo">
                    {detalle.seguimientos.map(
                      (
                        seguimiento,
                      ) => (
                        <article
                          key={
                            seguimiento.id
                          }
                        >
                          <header>
                            <Etiqueta
                              grupo="notificacion"
                              valor={
                                seguimiento
                                  .estadoNotificacion
                              }
                            />

                            <time>
                              {fechaHora(
                                seguimiento
                                  .createdAt,
                              )}
                            </time>
                          </header>

                          <p>
                            <strong>
                              Usuario:
                            </strong>{" "}
                            {seguimiento
                              .usuario
                              ?.nombre ??
                              "Importación inicial"}
                          </p>

                          <p>
                            <strong>
                              Notificador:
                            </strong>{" "}
                            {seguimiento
                              .notificador ??
                              "—"}
                          </p>

                          <p>
                            <strong>
                              Cedulón:
                            </strong>{" "}
                            {seguimiento
                              .numeroCedulon ??
                              "—"}
                          </p>

                          {seguimiento
                            .observacion && (
                            <p>
                              {
                                seguimiento
                                  .observacion
                              }
                            </p>
                          )}
                        </article>
                      ),
                    )}
                  </div>
                )}
              </section>

              <section className="bloque-informacion manual-bloque-historial">
                <h3>
                  Cambios y auditoría
                </h3>

                {detalle.historial.length ===
                0 ? (
                  <p className="sin-datos">
                    No existen cambios
                    registrados.
                  </p>
                ) : (
                  <div className="manual-linea-tiempo manual-linea-cambios">
                    {detalle.historial.map(
                      (item) => (
                        <article
                          key={item.id}
                        >
                          <header>
                            <strong>
                              {item.accion
                                .replaceAll(
                                  "_",
                                  " ",
                                )
                                .toLowerCase()}
                            </strong>

                            <time>
                              {fechaHora(
                                item.createdAt,
                              )}
                            </time>
                          </header>

                          <p>
                            <strong>
                              Usuario:
                            </strong>{" "}
                            {item.usuario
                              ?.nombre ??
                              "Sistema"}
                          </p>

                          {item.motivo && (
                            <p>
                              {item.motivo}
                            </p>
                          )}
                        </article>
                      ),
                    )}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function RequerimientosManuales({
  rol,
}: {
  rol: RolSesion;
}) {
  const [
    resumen,
    setResumen,
  ] = useState<
    ResumenRequerimientosManuales | null
  >(null);

  const [
    registros,
    setRegistros,
  ] = useState<
    RequerimientoManualResumen[]
  >([]);

  const [
    paginacion,
    setPaginacion,
  ] = useState<PaginacionManual>({
    pagina: 1,
    limite: 15,
    total: 0,
    totalPaginas: 0,
  });

  const [
    textoBusqueda,
    setTextoBusqueda,
  ] = useState("");

  const [
    filtros,
    setFiltros,
  ] = useState<
    FiltrosRequerimientosManuales
  >({
    buscar: "",
    tipoRegistro: "",
    estadoConciliado: "",
    estadoRevision: "",
    estadoNotificacion: "",
    periodoAnio: null,
    pagina: 1,
    limite: 15,
  });

  const [
    periodoTexto,
    setPeriodoTexto,
  ] = useState("");

  const [
    cargando,
    setCargando,
  ] = useState(true);

  const [
    detalle,
    setDetalle,
  ] = useState<
    RequerimientoManualDetalle | null
  >(null);

  const [
    cargandoDetalle,
    setCargandoDetalle,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null,
  );

  const cargarResumen =
    useCallback(async () => {
      try {
        const resultado =
          await obtenerResumenRequerimientosManuales();

        setResumen(resultado);
      } catch (errorDesconocido) {
        setError(
          errorDesconocido instanceof Error
            ? errorDesconocido.message
            : "No se pudo cargar el resumen.",
        );
      }
    }, []);

  const cargarLista =
    useCallback(async () => {
      try {
        setCargando(true);
        setError(null);

        const resultado =
          await obtenerRequerimientosManuales(
            filtros,
          );

        setRegistros(
          resultado.registros,
        );

        setPaginacion(
          resultado.paginacion,
        );
      } catch (errorDesconocido) {
        setError(
          errorDesconocido instanceof Error
            ? errorDesconocido.message
            : "No se pudieron cargar los requerimientos manuales.",
        );
      } finally {
        setCargando(false);
      }
    }, [filtros]);

  useEffect(() => {
    void cargarResumen();
  }, [cargarResumen]);

  useEffect(() => {
    void cargarLista();
  }, [cargarLista]);

  const tarjetasMetricas =
    useMemo(
      () => [
        {
          titulo: "Registros",
          valor:
            resumen
              ?.totalRegistros ??
            0,
          descripcion:
            "Números de requerimiento del Excel activo.",
        },
        {
          titulo: "Periodos",
          valor:
            resumen
              ?.totalPeriodos ??
            0,
          descripcion:
            "Años de deuda extraídos para conciliación.",
        },
        {
          titulo: "Discrepancias",
          valor:
            cantidadEstado(
              resumen,
              "revision",
              "DISCREPANCIA",
            ),
          descripcion:
            "El Excel y el cálculo muestran condiciones distintas.",
        },
      ],
      [resumen],
    );

  const tarjetasEstados =
    useMemo(
      () =>
        ESTADOS.map(
          (item) => ({
            estado: item.valor,
            etiqueta:
              item.etiqueta,
            valor:
              cantidadEstado(
                resumen,
                "conciliado",
                item.valor,
              ),
            descripcion:
              ({
                PAGADO:
                  "Cobertura de los cuatro trimestres.",
                PAGO_PARCIAL:
                  "Existe pago, pero la cobertura anual está incompleta.",
                PENDIENTE:
                  "Existe declaración sin recibos activos suficientes.",
                SIN_DECLARACION:
                  "No se encontró declaración para la placa y año.",
                REVISAR:
                  "El caso es ambiguo y necesita validación manual.",
                ANULADO:
                  "El Excel marca el requerimiento como anulado.",
                NO_APLICA:
                  "Registro vacío, sin registro o fuera de conciliación.",
              } satisfies Record<
                EstadoConciliacionManual,
                string
              >)[item.valor],
          }),
        ),
      [resumen],
    );

  function activarEstadoRapido(
    estado:
      EstadoConciliacionManual,
  ): void {
    cambiarFiltro(
      "estadoConciliado",
      filtros.estadoConciliado ===
        estado
        ? ""
        : estado,
    );
  }

  function buscar(
    evento: FormEvent,
  ): void {
    evento.preventDefault();

    setFiltros(
      (actual) => ({
        ...actual,
        buscar:
          textoBusqueda.trim(),
        periodoAnio:
          periodoTexto.trim()
            ? Number(
                periodoTexto,
              )
            : null,
        pagina: 1,
      }),
    );
  }

  function cambiarFiltro<
    K extends
      keyof FiltrosRequerimientosManuales,
  >(
    campo: K,
    valor:
      FiltrosRequerimientosManuales[K],
  ): void {
    setFiltros(
      (actual) => ({
        ...actual,
        [campo]: valor,
        pagina: 1,
      }),
    );
  }


  function cambiarPagina(
    pagina: number,
  ): void {
    setFiltros(
      (actual) => ({
        ...actual,
        pagina,
      }),
    );
  }

  function limpiar(): void {
    setTextoBusqueda("");
    setPeriodoTexto("");
    setFiltros({
      buscar: "",
      tipoRegistro: "",
      estadoConciliado: "",
      estadoRevision: "",
      estadoNotificacion: "",
      periodoAnio: null,
      pagina: 1,
      limite: 15,
    });
  }

  async function abrirDetalle(
    id: number,
  ): Promise<void> {
    try {
      setCargandoDetalle(true);
      setError(null);

      const resultado =
        await obtenerRequerimientoManualPorId(
          id,
        );

      setDetalle(resultado);
    } catch (errorDesconocido) {
      setError(
        errorDesconocido instanceof Error
          ? errorDesconocido.message
          : "No se pudo cargar el detalle.",
      );
    } finally {
      setCargandoDetalle(false);
    }
  }

  function detalleActualizado(
    actualizado:
      RequerimientoManualDetalle,
  ): void {
    setDetalle(actualizado);

    void cargarLista();
    void cargarResumen();
  }

  return (
    <main className="aplicacion">
      <header className="cabecera-principal manual-cabecera">
        <div>
          <p className="cabecera-etiqueta">
            Gestión operativa
          </p>

          <h1>
            Requerimientos manuales
          </h1>

          <p className="cabecera-descripcion">
            Consulta el Excel operativo,
            compara su condición con los
            pagos registrados y conserva
            el seguimiento de notificación
            con historial de cambios.
          </p>
        </div>

        <button
          type="button"
          className="boton-secundario"
          disabled={cargando}
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

      <section className="manual-metricas-grid">
        {tarjetasMetricas.map(
          (tarjeta) => (
            <TarjetaMetrica
              key={
                tarjeta.titulo
              }
              {...tarjeta}
            />
          ),
        )}
      </section>

      <section className="manual-estados-panel">
        <header className="manual-estados-panel-cabecera">
          <div>
            <p className="manual-seccion-etiqueta">
              Filtros rápidos
            </p>
            <h2>
              Estado de conciliación
            </h2>
            <p>
              Selecciona una tarjeta para mostrar
              únicamente los registros de ese estado.
              Vuelve a seleccionarla para quitar el filtro.
            </p>
          </div>

          {filtros.estadoConciliado && (
            <button
              type="button"
              className="boton-secundario"
              onClick={() =>
                cambiarFiltro(
                  "estadoConciliado",
                  "",
                )
              }
            >
              Mostrar todos
            </button>
          )}
        </header>

        <div className="manual-estados-grid">
          {tarjetasEstados.map(
            (tarjeta) => (
              <TarjetaEstado
                key={
                  tarjeta.estado
                }
                {...tarjeta}
                activo={
                  filtros
                    .estadoConciliado ===
                  tarjeta.estado
                }
                alSeleccionar={() =>
                  activarEstadoRapido(
                    tarjeta.estado,
                  )
                }
              />
            ),
          )}
        </div>
      </section>

      <section className="panel-filtros manual-panel-filtros">
        <header className="manual-filtros-cabecera">
          <div>
            <p className="manual-seccion-etiqueta">
              Búsqueda avanzada
            </p>
            <h2>Filtros</h2>
          </div>

          <span>
            {paginacion.total} resultado(s)
          </span>
        </header>
        <form
          onSubmit={buscar}
          className="manual-filtros"
        >
          <label className="manual-busqueda">
            Buscar
            <input
              value={
                textoBusqueda
              }
              placeholder="Número, placa, propietario, notificador o cedulón"
              onChange={(evento) =>
                setTextoBusqueda(
                  evento.target
                    .value,
                )
              }
            />
          </label>

          <label>
            Tipo
            <select
              value={
                filtros
                  .tipoRegistro ??
                ""
              }
              onChange={(evento) =>
                cambiarFiltro(
                  "tipoRegistro",
                  evento.target
                    .value as
                    TipoRegistroManual |
                    "",
                )
              }
            >
              <option value="">
                Todos
              </option>

              {TIPOS.map(
                (item) => (
                  <option
                    key={
                      item.valor
                    }
                    value={
                      item.valor
                    }
                  >
                    {
                      item.etiqueta
                    }
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            Estado calculado
            <select
              value={
                filtros
                  .estadoConciliado ??
                ""
              }
              onChange={(evento) =>
                cambiarFiltro(
                  "estadoConciliado",
                  evento.target
                    .value as
                    EstadoConciliacionManual |
                    "",
                )
              }
            >
              <option value="">
                Todos
              </option>

              {ESTADOS.map(
                (item) => (
                  <option
                    key={
                      item.valor
                    }
                    value={
                      item.valor
                    }
                  >
                    {
                      item.etiqueta
                    }
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            Comparación
            <select
              value={
                filtros
                  .estadoRevision ??
                ""
              }
              onChange={(evento) =>
                cambiarFiltro(
                  "estadoRevision",
                  evento.target
                    .value as
                    EstadoRevisionManual |
                    "",
                )
              }
            >
              <option value="">
                Todas
              </option>

              {REVISIONES.map(
                (item) => (
                  <option
                    key={
                      item.valor
                    }
                    value={
                      item.valor
                    }
                  >
                    {
                      item.etiqueta
                    }
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            Notificación
            <select
              value={
                filtros
                  .estadoNotificacion ??
                ""
              }
              onChange={(evento) =>
                cambiarFiltro(
                  "estadoNotificacion",
                  evento.target
                    .value as
                    EstadoNotificacionManual |
                    "",
                )
              }
            >
              <option value="">
                Todas
              </option>

              {NOTIFICACIONES.map(
                (item) => (
                  <option
                    key={
                      item.valor
                    }
                    value={
                      item.valor
                    }
                  >
                    {
                      item.etiqueta
                    }
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            Año de deuda
            <input
              type="number"
              min="1900"
              max="2100"
              value={
                periodoTexto
              }
              placeholder="2024"
              onChange={(evento) =>
                setPeriodoTexto(
                  evento.target
                    .value,
                )
              }
            />
          </label>

          <div className="manual-filtros-acciones">
            <button
              type="submit"
              className="boton-primario"
            >
              Buscar
            </button>

            <button
              type="button"
              className="boton-secundario"
              onClick={limpiar}
            >
              Limpiar
            </button>
          </div>
        </form>
      </section>

      {(filtros.estadoConciliado ||
        filtros.estadoRevision ||
        filtros.tipoRegistro ||
        filtros.estadoNotificacion ||
        filtros.buscar ||
        filtros.periodoAnio) && (
        <div className="manual-filtros-aplicados">
          <span>
            Filtros aplicados · {paginacion.total}{" "}
            resultado(s)
          </span>

          <button
            type="button"
            onClick={limpiar}
          >
            Quitar todos
          </button>
        </div>
      )}

      <section className="tabla-contenedor manual-tabla-contenedor">
        <table className="tabla-ordenes manual-tabla">
          <thead>
            <tr>
              <th>N.° Req.</th>
              <th>Placa</th>
              <th>Propietario</th>
              <th>Años requerimiento</th>
              <th>Pagos SisGAT</th>
              <th>Estado Excel</th>
              <th>Calculado</th>
              <th>Comparación</th>
              <th>Notificación</th>
              <th className="manual-columna-acciones">Acciones</th>
            </tr>
          </thead>

          <tbody>
            {cargando ? (
              <tr>
                <td
                  colSpan={10}
                  className="tabla-mensaje"
                >
                  Cargando requerimientos
                  manuales...
                </td>
              </tr>
            ) : registros.length ===
              0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="tabla-mensaje"
                >
                  No se encontraron
                  registros con los filtros
                  seleccionados.
                </td>
              </tr>
            ) : (
              registros.map(
                (registro) => (
                  <tr
                    key={
                      registro.id
                    }
                  >
                    <td>
                      <strong>
                        {
                          registro
                            .numeroRequerimiento
                        }
                      </strong>

                      <small className="manual-tabla-secundario">
                        Fila{" "}
                        {registro
                          .filaOrigen ??
                          "—"}
                      </small>
                    </td>

                    <td>
                      {registro
                        .placaNormalizada ??
                        registro
                          .placaOriginal ??
                        "—"}
                    </td>

                    <td>
                      {registro
                        .propietarioOriginal ??
                        "—"}
                    </td>

                    <td>
                      {registro
                        .deudaOriginal ??
                        "—"}
                    </td>

                    <td className="manual-columna-pagos">
                      <strong>
                        {registro
                          .analisisAnios
                          .historialPagosSisgat}
                      </strong>

                      {registro
                        .analisisAnios
                        .ventanaTresAniosPagados
                        .length ===
                        3 && (
                        <small className="manual-tabla-secundario">
                          Tres años completos:{" "}
                          {registro
                            .analisisAnios
                            .ventanaTresAniosPagados
                            .join(" · ")}
                        </small>
                      )}
                    </td>

                    <td>
                      {registro
                        .estadoManualOriginal ??
                        "—"}
                    </td>

                    <td>
                      <Etiqueta
                        grupo="conciliado"
                        valor={
                          registro
                            .estadoConciliado
                        }
                      />
                    </td>

                    <td>
                      <Etiqueta
                        grupo="revision"
                        valor={
                          registro
                            .estadoRevision
                        }
                      />

                      <EtiquetaValidacionAnios
                        detalle={registro}
                      />
                    </td>

                    <td>
                      <Etiqueta
                        grupo="notificacion"
                        valor={
                          registro
                            .estadoNotificacion
                        }
                      />

                      {registro
                        .notificadorActual && (
                        <small className="manual-tabla-secundario">
                          {
                            registro
                              .notificadorActual
                          }
                        </small>
                      )}
                    </td>

                    <td className="manual-columna-acciones">
                      <button
                        type="button"
                        className="boton-tabla"
                        onClick={() =>
                          void abrirDetalle(
                            registro.id,
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
      </section>

      <footer className="paginacion">
        <span>
          {paginacion.total} registro(s)
        </span>

        <div>
          <button
            type="button"
            disabled={
              paginacion.pagina <=
              1
            }
            onClick={() =>
              cambiarPagina(
                Math.max(
                  1,
                  paginacion.pagina -
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
              paginacion.pagina >=
              paginacion
                .totalPaginas
            }
            onClick={() =>
              cambiarPagina(
                paginacion.pagina +
                  1,
              )
            }
          >
            Siguiente
          </button>
        </div>
      </footer>

      {cargandoDetalle && (
        <div className="cargando-detalle">
          Cargando detalle...
        </div>
      )}

      {detalle && (
        <ModalDetalle
          key={detalle.id}
          detalle={detalle}
          rol={rol}
          alCerrar={() =>
            setDetalle(null)
          }
          alActualizar={
            detalleActualizado
          }
        />
      )}
    </main>
  );
}

export default RequerimientosManuales;
