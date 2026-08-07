import {
  EstadoConciliacion,
  Prisma,
} from "../../generated/prisma/client";
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { prisma } from "../lib/prisma";

const router = Router();

function enteroPositivo(
  valor: unknown,
  predeterminado: number,
): number {
  const numero = Number(valor);

  if (!Number.isInteger(numero) || numero <= 0) {
    return predeterminado;
  }

  return numero;
}

function normalizarPlacaBusqueda(
  valor: string,
): string {
  const placa = valor
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (placa.length === 6) {
    return `${placa.slice(0, 3)}-${placa.slice(3)}`;
  }

  return valor.trim();
}

interface ReciboCobertura {
  activo: boolean;
  trimestreDesde: number | null;
  trimestreHasta: number | null;
}

interface DetalleCobertura {
  periodoAnio: number;
  trimestreDesde: number;
  trimestreHasta: number;
  declaracion: {
    recibos: ReciboCobertura[];
  } | null;
}

interface DeclaracionHistorialPagos {
  anioDeclaracion: number;
  dniRuc: string | null;
  placa: string | null;
  fechaInscripcion: Date | null;
  recibos: ReciboCobertura[];
}

interface ResumenPagosLiquidacion {
  pagosAplicadosLiquidacion: string;
  historialPagosSisgat: string;
  pagosFueraLiquidacion: string;
}

function resumirTrimestres(
  trimestres: Iterable<number>,
): string {
  const valores = [
    ...new Set(
      [...trimestres]
        .filter(
          (valor) =>
            Number.isInteger(valor) &&
            valor >= 1 &&
            valor <= 4,
        )
        .sort((a, b) => a - b),
    ),
  ];

  if (valores.length === 0) {
    return "—";
  }

  const segmentos: string[] = [];
  let inicio = valores[0];
  let anterior = valores[0];

  for (let indice = 1; indice < valores.length; indice += 1) {
    const actual = valores[indice];

    if (actual === anterior + 1) {
      anterior = actual;
      continue;
    }

    segmentos.push(
      inicio === anterior ? String(inicio) : `${inicio}-${anterior}`,
    );

    inicio = actual;
    anterior = actual;
  }

  segmentos.push(
    inicio === anterior ? String(inicio) : `${inicio}-${anterior}`,
  );

  return segmentos.join(",");
}

function obtenerCoberturaDetalle(
  detalle: DetalleCobertura,
): {
  pagosSisgat: string;
  trimestresCubiertos: string;
  trimestresFaltantes: string;
  cantidadTrimestresCubiertos: number;
  cantidadTrimestresSolicitados: number;
  coberturaCompleta: boolean;
} {
  const solicitados = Array.from(
    {
      length: detalle.trimestreHasta - detalle.trimestreDesde + 1,
    },
    (_valor, indice) => detalle.trimestreDesde + indice,
  );

  const cubiertos = new Set<number>();

  for (const recibo of detalle.declaracion?.recibos ?? []) {
    if (
      !recibo.activo ||
      recibo.trimestreDesde === null ||
      recibo.trimestreHasta === null
    ) {
      continue;
    }

    const desde = Math.max(
      recibo.trimestreDesde,
      detalle.trimestreDesde,
    );

    const hasta = Math.min(
      recibo.trimestreHasta,
      detalle.trimestreHasta,
    );

    if (desde > hasta) {
      continue;
    }

    for (let trimestre = desde; trimestre <= hasta; trimestre += 1) {
      cubiertos.add(trimestre);
    }
  }

  const faltantes = solicitados.filter(
    (trimestre) => !cubiertos.has(trimestre),
  );

  return {
    pagosSisgat:
      cubiertos.size === 0
        ? "Sin pagos activos"
        : `${detalle.periodoAnio} [${resumirTrimestres(cubiertos)}]`,
    trimestresCubiertos: resumirTrimestres(cubiertos),
    trimestresFaltantes: resumirTrimestres(faltantes),
    cantidadTrimestresCubiertos: cubiertos.size,
    cantidadTrimestresSolicitados: solicitados.length,
    coberturaCompleta: faltantes.length === 0,
  };
}

type CoberturaPorAnio =
  Map<number, Set<number>>;

function agregarTrimestres(
  cobertura: CoberturaPorAnio,
  anio: number,
  trimestreDesde: number | null,
  trimestreHasta: number | null,
): void {
  if (
    trimestreDesde === null ||
    trimestreHasta === null
  ) {
    return;
  }

  const desde = Math.max(
    1,
    trimestreDesde,
  );

  const hasta = Math.min(
    4,
    trimestreHasta,
  );

  if (desde > hasta) {
    return;
  }

  const trimestres =
    cobertura.get(anio) ??
    new Set<number>();

  for (
    let trimestre = desde;
    trimestre <= hasta;
    trimestre += 1
  ) {
    trimestres.add(trimestre);
  }

  cobertura.set(
    anio,
    trimestres,
  );
}

function obtenerCoberturaAplicada(
  detalles: DetalleCobertura[],
): CoberturaPorAnio {
  const cobertura:
    CoberturaPorAnio =
      new Map();

  for (const detalle of detalles) {
    for (
      const recibo
      of detalle.declaracion
        ?.recibos ?? []
    ) {
      if (!recibo.activo) {
        continue;
      }

      const desde =
        recibo.trimestreDesde ===
          null
          ? null
          : Math.max(
              recibo.trimestreDesde,
              detalle.trimestreDesde,
            );

      const hasta =
        recibo.trimestreHasta ===
          null
          ? null
          : Math.min(
              recibo.trimestreHasta,
              detalle.trimestreHasta,
            );

      agregarTrimestres(
        cobertura,
        detalle.periodoAnio,
        desde,
        hasta,
      );
    }
  }

  return cobertura;
}

function obtenerCoberturaHistorial(
  declaraciones:
    DeclaracionHistorialPagos[],
): CoberturaPorAnio {
  const cobertura:
    CoberturaPorAnio =
      new Map();

  for (
    const declaracion
    of declaraciones
  ) {
    for (
      const recibo
      of declaracion.recibos
    ) {
      if (!recibo.activo) {
        continue;
      }

      agregarTrimestres(
        cobertura,
        declaracion
          .anioDeclaracion,
        recibo.trimestreDesde,
        recibo.trimestreHasta,
      );
    }
  }

  return cobertura;
}

function restarCoberturas(
  historial:
    CoberturaPorAnio,
  aplicada:
    CoberturaPorAnio,
): CoberturaPorAnio {
  const fuera:
    CoberturaPorAnio =
      new Map();

  for (
    const [
      anio,
      trimestresHistorial,
    ]
    of historial.entries()
  ) {
    const trimestresAplicados =
      aplicada.get(anio) ??
      new Set<number>();

    const trimestresFuera =
      new Set(
        [...trimestresHistorial]
          .filter(
            (trimestre) =>
              !trimestresAplicados
                .has(trimestre),
          ),
      );

    if (
      trimestresFuera.size > 0
    ) {
      fuera.set(
        anio,
        trimestresFuera,
      );
    }
  }

  return fuera;
}

function formatearCobertura(
  cobertura:
    CoberturaPorAnio,
  mensajeVacio: string,
): string {
  if (
    cobertura.size === 0
  ) {
    return mensajeVacio;
  }

  return [
    ...cobertura.entries(),
  ]
    .sort(
      ([anioA], [anioB]) =>
        anioA - anioB,
    )
    .map(
      ([anio, trimestres]) =>
        `${anio} [${resumirTrimestres(
          trimestres,
        )}]`,
    )
    .join(" · ");
}

function claveVehiculo(
  placa: string,
): string {
  return normalizarPlacaBusqueda(
    placa,
  );
}

function formatearHistorialDeclaraciones(
  declaraciones:
    DeclaracionHistorialPagos[],
): string {
  if (declaraciones.length === 0) {
    return "Sin declaraciones SisGAT";
  }

  const trimestresPorAnio =
    new Map<
      number,
      Set<number>
    >();

  for (
    const declaracion
    of declaraciones
  ) {
    const trimestres =
      trimestresPorAnio.get(
        declaracion
          .anioDeclaracion,
      ) ??
      new Set<number>();

    for (
      const recibo
      of declaracion.recibos
    ) {
      if (!recibo.activo) {
        continue;
      }

      if (
        recibo.trimestreDesde ===
          null ||
        recibo.trimestreHasta ===
          null
      ) {
        continue;
      }

      const desde = Math.max(
        1,
        recibo.trimestreDesde,
      );
      const hasta = Math.min(
        4,
        recibo.trimestreHasta,
      );

      if (desde > hasta) {
        continue;
      }

      for (
        let trimestre = desde;
        trimestre <= hasta;
        trimestre += 1
      ) {
        trimestres.add(
          trimestre,
        );
      }
    }

    trimestresPorAnio.set(
      declaracion
        .anioDeclaracion,
      trimestres,
    );
  }

  return [
    ...trimestresPorAnio
      .entries(),
  ]
    .sort(
      ([anioA], [anioB]) =>
        anioA - anioB,
    )
    .map(
      ([anio, trimestres]) =>
        trimestres.size === 0
          ? `${anio} [NO HAY PAGOS]`
          : `${anio} [${resumirTrimestres(
              trimestres,
            )}]`,
    )
    .join(" · ");
}

function obtenerAnioInscripcionSisgat(
  declaraciones: DeclaracionHistorialPagos[],
): number | null {
  const anios = [
    ...new Set(
      declaraciones
        .map((declaracion) =>
          declaracion.fechaInscripcion?.getUTCFullYear() ?? null,
        )
        .filter((valor): valor is number => valor !== null),
    ),
  ];

  return anios.length === 1 ? anios[0] : null;
}

interface PeriodoTributarioSisgat {
  anioInscripcion: number | null;
  anioUltimoTributario: number | null;
  tresAniosPagados: boolean | null;
}

function obtenerPeriodoTributarioSisgat(
  declaraciones: DeclaracionHistorialPagos[],
): PeriodoTributarioSisgat {
  const anioInscripcion =
    obtenerAnioInscripcionSisgat(
      declaraciones,
    );

  if (anioInscripcion === null) {
    return {
      anioInscripcion: null,
      anioUltimoTributario: null,
      tresAniosPagados: null,
    };
  }

  const aniosEsperados = [
    anioInscripcion + 1,
    anioInscripcion + 2,
    anioInscripcion + 3,
  ];

  const cobertura =
    obtenerCoberturaHistorial(
      declaraciones,
    );

  const tresAniosPagados =
    aniosEsperados.every(
      (anio) => {
        const trimestres =
          cobertura.get(anio);

        return (
          trimestres?.has(1) === true &&
          trimestres.has(2) &&
          trimestres.has(3) &&
          trimestres.has(4)
        );
      },
    );

  return {
    anioInscripcion,
    anioUltimoTributario:
      anioInscripcion + 3,
    tresAniosPagados,
  };
}

function obtenerResumenPagosLiquidacion(
  detalles:
    DetalleCobertura[],
  declaraciones:
    DeclaracionHistorialPagos[],
): ResumenPagosLiquidacion {
  const aplicada =
    obtenerCoberturaAplicada(
      detalles,
    );

  const historial =
    obtenerCoberturaHistorial(
      declaraciones,
    );

  const fuera =
    restarCoberturas(
      historial,
      aplicada,
    );

  return {
    pagosAplicadosLiquidacion:
      formatearCobertura(
        aplicada,
        "Sin pagos aplicados",
      ),

    historialPagosSisgat:
      formatearHistorialDeclaraciones(
        declaraciones,
      ),

    pagosFueraLiquidacion:
      formatearCobertura(
        fuera,
        "Sin pagos fuera de esta liquidación",
      ),
  };
}

router.get(
  "/resumen",
  async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const liquidaciones =
        await prisma.liquidacion.findMany({
          select: {
            estado: true,
            importeTotal: true,
            totalPagado: true,
            saldo: true,
          },
        });

      const porEstado = new Map<
        EstadoConciliacion,
        {
          estado: EstadoConciliacion;
          cantidad: number;
          importeTotal: number;
          totalPagado: number;
          saldo: number;
        }
      >();

      let importeTotal = 0;
      let totalPagado = 0;
      let saldo = 0;

      for (const liquidacion of liquidaciones) {
        const importe = Number(
          liquidacion.importeTotal,
        );
        const pagado = Number(
          liquidacion.totalPagado,
        );
        const pendiente = Number(
          liquidacion.saldo,
        );

        importeTotal += importe;
        totalPagado += pagado;
        saldo += pendiente;

        const actual =
          porEstado.get(
            liquidacion.estado,
          ) ?? {
            estado:
              liquidacion.estado,
            cantidad: 0,
            importeTotal: 0,
            totalPagado: 0,
            saldo: 0,
          };

        actual.cantidad += 1;
        actual.importeTotal += importe;
        actual.totalPagado += pagado;
        actual.saldo += pendiente;

        porEstado.set(
          liquidacion.estado,
          actual,
        );
      }

      res.status(200).json({
        ok: true,
        data: {
          totalLiquidaciones:
            liquidaciones.length,
          montos: {
            importeTotal,
            totalPagado,
            saldo,
          },
          liquidacionesPorEstado:
            Array.from(
              porEstado.values(),
            ).sort((a, b) =>
              a.estado.localeCompare(
                b.estado,
              ),
            ),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const pagina = enteroPositivo(
        req.query.pagina,
        1,
      );

      const limite = Math.min(
        enteroPositivo(
          req.query.limite,
          20,
        ),
        100,
      );

      const buscar = String(
        req.query.buscar ?? "",
      ).trim();

      const estadoTexto = String(
        req.query.estado ?? "",
      ).trim();

      const anioLiquidacion = Number(
        req.query.anioLiquidacion,
      );

      const periodoAnio = Number(
        req.query.periodoAnio,
      );

      const where:
        Prisma.LiquidacionWhereInput = {};

      if (buscar) {
        const placaNormalizada =
          normalizarPlacaBusqueda(
            buscar,
          );

        where.OR = [
          {
            numeroLiquidacion: {
              contains: buscar,
              mode: "insensitive",
            },
          },
          {
            dniRucOriginal: {
              contains: buscar,
              mode: "insensitive",
            },
          },
          {
            nombreOriginal: {
              contains: buscar,
              mode: "insensitive",
            },
          },
          {
            placa: {
              contains: buscar,
              mode: "insensitive",
            },
          },
          {
            placa: {
              contains:
                placaNormalizada,
              mode: "insensitive",
            },
          },
          {
            idOrigen: {
              contains: buscar,
              mode: "insensitive",
            },
          },
        ];
      }

      if (
        Object.values(
          EstadoConciliacion,
        ).includes(
          estadoTexto as
            EstadoConciliacion,
        )
      ) {
        where.estado =
          estadoTexto as
            EstadoConciliacion;
      }

      if (
        Number.isInteger(
          anioLiquidacion,
        )
      ) {
        where.anioLiquidacion =
          anioLiquidacion;
      }

      if (
        Number.isInteger(periodoAnio)
      ) {
        where.detalles = {
          some: {
            periodoAnio,
          },
        };
      }

      const [total, liquidaciones] =
        await Promise.all([
          prisma.liquidacion.count({
            where,
          }),

          prisma.liquidacion.findMany({
            where,
            skip:
              (pagina - 1) * limite,
            take: limite,
            orderBy: [
              {
                anioLiquidacion:
                  "desc",
              },
              {
                numeroLiquidacion:
                  "desc",
              },
            ],
            include: {
              contribuyente: {
                select: {
                  id: true,
                  numeroDocumento: true,
                  nombreRazonSocial: true,
                },
              },
              detalles: {
                orderBy: [
                  {
                    periodoAnio: "asc",
                  },
                  {
                    trimestreDesde: "asc",
                  },
                ],
                select: {
                  periodoAnio: true,
                  trimestreDesde: true,
                  trimestreHasta: true,
                  declaracion: {
                    select: {
                      recibos: {
                        select: {
                          activo: true,
                          trimestreDesde: true,
                          trimestreHasta: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          }),
        ]);

      const placasHistorial =
        [
          ...new Set(
            liquidaciones
              .map(
                (
                  liquidacion,
                ) =>
                  liquidacion.placa
                    ? claveVehiculo(
                        liquidacion
                          .placa,
                      )
                    : "",
              )
              .filter(Boolean),
          ),
        ];

      const declaracionesHistorial =
        placasHistorial.length ===
        0
          ? []
          : await prisma
              .declaracion
              .findMany({
                where: {
                  placa: {
                    in:
                      placasHistorial,
                  },
                },
                select: {
                  anioDeclaracion:
                    true,
                  dniRuc: true,
                  placa: true,
                  fechaInscripcion: true,
                  recibos: {
                    where: {
                      activo: true,
                    },
                    select: {
                      activo: true,
                      trimestreDesde:
                        true,
                      trimestreHasta:
                        true,
                    },
                  },
                },
                orderBy: [
                  {
                    placa: "asc",
                  },
                  {
                    anioDeclaracion:
                      "asc",
                  },
                ],
              });

      const historialPorPlaca =
        new Map<
          string,
          DeclaracionHistorialPagos[]
        >();

      for (
        const declaracion
        of declaracionesHistorial
      ) {
        if (!declaracion.placa) {
          continue;
        }

        const clave =
          claveVehiculo(
            declaracion.placa,
          );

        if (!clave) {
          continue;
        }

        const acumuladas =
          historialPorPlaca.get(
            clave,
          ) ?? [];

        acumuladas.push(
          declaracion,
        );

        historialPorPlaca.set(
          clave,
          acumuladas,
        );
      }

      res.status(200).json({
        ok: true,
        data: {
          registros:
            liquidaciones.map(
              (liquidacion) => {
                const declaraciones =
                  liquidacion.placa
                    ? (
                        historialPorPlaca.get(
                          claveVehiculo(
                            liquidacion
                              .placa,
                          ),
                        ) ?? []
                      )
                    : [];

                const resumenPagos =
                  obtenerResumenPagosLiquidacion(
                    liquidacion.detalles,
                    declaraciones,
                  );

                return {
                id: liquidacion.id,
                anioLiquidacion:
                  liquidacion
                    .anioLiquidacion,
                numeroLiquidacion:
                  liquidacion
                    .numeroLiquidacion,
                fechaEmision:
                  liquidacion
                    .fechaEmision,
                dniRuc:
                  liquidacion
                    .dniRucOriginal,
                nombre:
                  liquidacion
                    .nombreOriginal,
                placa:
                  liquidacion.placa,
                periodo:
                  liquidacion
                    .periodoOriginal,
                importeTotal:
                  Number(
                    liquidacion
                      .importeTotal,
                  ),
                totalPagado:
                  Number(
                    liquidacion
                      .totalPagado,
                  ),
                saldo:
                  Number(
                    liquidacion.saldo,
                  ),
                pagosSisgat:
                  resumenPagos
                    .historialPagosSisgat,
                pagosAplicadosLiquidacion:
                  resumenPagos
                    .pagosAplicadosLiquidacion,
                historialPagosSisgat:
                  resumenPagos
                    .historialPagosSisgat,
                pagosFueraLiquidacion:
                  resumenPagos
                    .pagosFueraLiquidacion,
                anioInscripcion:
                  obtenerPeriodoTributarioSisgat(
                    declaraciones,
                  ).anioInscripcion,
                anioUltimoTributario:
                  obtenerPeriodoTributarioSisgat(
                    declaraciones,
                  ).anioUltimoTributario,
                tresAniosPagados:
                  obtenerPeriodoTributarioSisgat(
                    declaraciones,
                  ).tresAniosPagados,
                estado:
                  liquidacion.estado,
                estadoOriginal:
                  liquidacion
                    .estadoOriginal,
                cantidadDetalles:
                  liquidacion.detalles
                    .length,
                contribuyente:
                  liquidacion
                    .contribuyente,
                };
              },
            ),

          paginacion: {
            pagina,
            limite,
            total,
            totalPaginas:
              Math.ceil(
                total / limite,
              ),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:id",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const id = Number(
        req.params.id,
      );

      if (
        !Number.isInteger(id) ||
        id <= 0
      ) {
        res.status(400).json({
          ok: false,
          message:
            "El identificador de la liquidación no es válido.",
        });
        return;
      }

      const liquidacion =
        await prisma.liquidacion.findUnique({
          where: {
            id,
          },
          include: {
            contribuyente: true,
            detalles: {
              orderBy: [
                {
                  periodoAnio: "asc",
                },
                {
                  trimestreDesde:
                    "asc",
                },
              ],
              include: {
                declaracion: {
                  include: {
                    recibos: {
                      orderBy: [
                        {
                          trimestreDesde:
                            "asc",
                        },
                        {
                          numeroRecibo:
                            "asc",
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        });

      if (!liquidacion) {
        res.status(404).json({
          ok: false,
          message:
            "No se encontró la liquidación solicitada.",
        });
        return;
      }

      const declaracionesHistorial =
        liquidacion.placa
          ? await prisma
              .declaracion
              .findMany({
                where: {
                  placa:
                    claveVehiculo(
                      liquidacion
                        .placa,
                    ),
                },
                select: {
                  anioDeclaracion:
                    true,
                  dniRuc: true,
                  placa: true,
                  fechaInscripcion: true,
                  recibos: {
                    where: {
                      activo: true,
                    },
                    select: {
                      activo: true,
                      trimestreDesde:
                        true,
                      trimestreHasta:
                        true,
                    },
                  },
                },
                orderBy: {
                  anioDeclaracion:
                    "asc",
                },
              })
          : [];

      const resumenPagos =
        obtenerResumenPagosLiquidacion(
          liquidacion.detalles,
          declaracionesHistorial,
        );

      res.status(200).json({
        ok: true,
        data: {
          id: liquidacion.id,
          anioLiquidacion:
            liquidacion
              .anioLiquidacion,
          numeroLiquidacion:
            liquidacion
              .numeroLiquidacion,
          idOrigen:
            liquidacion.idOrigen,
          fechaEmision:
            liquidacion.fechaEmision,
          dniRuc:
            liquidacion
              .dniRucOriginal,
          nombre:
            liquidacion
              .nombreOriginal,
          direccion:
            liquidacion
              .direccionOriginal,
          placa: liquidacion.placa,
          fechaSunarp:
            liquidacion.fechaSunarp,
          estadoOriginal:
            liquidacion
              .estadoOriginal,
          periodoOriginal:
            liquidacion
              .periodoOriginal,
          importeTotal:
            Number(
              liquidacion
                .importeTotal,
            ),
          totalPagado:
            Number(
              liquidacion
                .totalPagado,
            ),
          saldo:
            Number(
              liquidacion.saldo,
            ),
          pagosSisgat:
            resumenPagos
              .historialPagosSisgat,
          pagosAplicadosLiquidacion:
            resumenPagos
              .pagosAplicadosLiquidacion,
          historialPagosSisgat:
            resumenPagos
              .historialPagosSisgat,
          pagosFueraLiquidacion:
            resumenPagos
              .pagosFueraLiquidacion,
          anioInscripcion:
            obtenerPeriodoTributarioSisgat(
              declaracionesHistorial,
            ).anioInscripcion,
          anioUltimoTributario:
            obtenerPeriodoTributarioSisgat(
              declaracionesHistorial,
            ).anioUltimoTributario,
          tresAniosPagados:
            obtenerPeriodoTributarioSisgat(
              declaracionesHistorial,
            ).tresAniosPagados,
          estado:
            liquidacion.estado,
          anioRVeh:
            liquidacion.anioRVeh,
          numeroRVeh:
            liquidacion.numeroRVeh,
          fechaGeneracion:
            liquidacion
              .fechaGeneracion,
          contribuyente:
            liquidacion
              .contribuyente,

          detalles:
            liquidacion.detalles.map(
              (detalle) => {
                const cobertura =
                  obtenerCoberturaDetalle(
                    detalle,
                  );

                return {
                id: detalle.id,
                periodoAnio:
                  detalle.periodoAnio,
                periodoOriginal:
                  detalle
                    .periodoOriginal,
                trimestreDesde:
                  detalle
                    .trimestreDesde,
                trimestreHasta:
                  detalle
                    .trimestreHasta,
                valorReferencial:
                  detalle
                    .valorReferencial ===
                  null
                    ? null
                    : Number(
                        detalle
                          .valorReferencial,
                      ),
                anioFabricacion:
                  detalle
                    .anioFabricacion,
                uit:
                  detalle.uit === null
                    ? null
                    : Number(
                        detalle.uit,
                      ),
                baseImponible:
                  detalle
                    .baseImponible ===
                  null
                    ? null
                    : Number(
                        detalle
                          .baseImponible,
                      ),
                impuesto:
                  detalle.impuesto ===
                  null
                    ? null
                    : Number(
                        detalle
                          .impuesto,
                      ),
                reajuste:
                  detalle.reajuste ===
                  null
                    ? null
                    : Number(
                        detalle
                          .reajuste,
                      ),
                interes:
                  detalle.interes ===
                  null
                    ? null
                    : Number(
                        detalle
                          .interes,
                      ),
                gastosAdmin:
                  detalle.gastosAdmin ===
                  null
                    ? null
                    : Number(
                        detalle
                          .gastosAdmin,
                      ),
                totalPeriodo:
                  Number(
                    detalle
                      .totalPeriodo,
                  ),
                montoPagado:
                  Number(
                    detalle
                      .montoPagado,
                  ),
                saldo:
                  Number(
                    detalle.saldo,
                  ),
                pagosSisgat:
                  cobertura.pagosSisgat,
                trimestresCubiertos:
                  cobertura.trimestresCubiertos,
                trimestresFaltantes:
                  cobertura.trimestresFaltantes,
                cantidadTrimestresCubiertos:
                  cobertura.cantidadTrimestresCubiertos,
                cantidadTrimestresSolicitados:
                  cobertura.cantidadTrimestresSolicitados,
                coberturaCompleta:
                  cobertura.coberturaCompleta,
                diferenciaMontoInformativa:
                  Math.round(
                    (
                      Number(
                        detalle.totalPeriodo,
                      ) -
                      Number(
                        detalle.montoPagado,
                      ) +
                      Number.EPSILON
                    ) *
                      100,
                  ) / 100,
                estado:
                  detalle.estado,
                observacion:
                  detalle.observacion,

                declaracion:
                  detalle.declaracion
                    ? {
                        id:
                          detalle
                            .declaracion
                            .id,
                        anioDeclaracion:
                          detalle
                            .declaracion
                            .anioDeclaracion,
                        numeroDeclaracion:
                          detalle
                            .declaracion
                            .numeroDeclaracion,
                        estadoConciliacion:
                          detalle
                            .declaracion
                            .estadoConciliacion,
                        recibos:
                          detalle
                            .declaracion
                            .recibos.map(
                              (recibo) => ({
                                id:
                                  recibo.id,
                                anioRecibo:
                                  recibo
                                    .anioRecibo,
                                numeroRecibo:
                                  recibo
                                    .numeroRecibo,
                                monto:
                                  Number(
                                    recibo
                                      .monto,
                                  ),
                                trimestre:
                                  recibo
                                    .trimestreOriginal,
                                trimestreDesde:
                                  recibo
                                    .trimestreDesde,
                                trimestreHasta:
                                  recibo
                                    .trimestreHasta,
                                estadoOriginal:
                                  recibo
                                    .estadoOriginal,
                                activo:
                                  recibo
                                    .activo,
                              }),
                            ),
                      }
                    : null,
                };
              },
            ),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

export {
  router as liquidacionesRouter,
};
