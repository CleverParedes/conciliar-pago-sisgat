import {
  EstadoConciliacion,
  EstadoVersionDatos,
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

  if (
    !Number.isInteger(numero) ||
    numero <= 0
  ) {
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


interface PagoSisgatConsulta {
  declaracionId: number;
  anioDeclaracion: number;
  anioInscripcion: number | null;
  id: number | null;
  anioRecibo: number | null;
  numeroRecibo: string | null;
  monto: number | null;
  trimestreOriginal: string | null;
  trimestreDesde: number | null;
  trimestreHasta: number | null;
  estadoOriginal: string | null;
  activo: boolean;
}

function normalizarPlacaPagosSisgat(
  valor: string | null,
): string {
  return (valor ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function variantesPlacaPagosSisgat(
  valor: string | null,
): string[] {
  const original = (valor ?? "").trim();

  if (!original) {
    return [];
  }

  const mayuscula = original.toUpperCase();
  const normalizada =
    normalizarPlacaPagosSisgat(original);

  const formateada =
    normalizada.length === 6
      ? `${normalizada.slice(0, 3)}-${normalizada.slice(3)}`
      : normalizada;

  return Array.from(
    new Set(
      [
        original,
        mayuscula,
        normalizada,
        formateada,
      ].filter(Boolean),
    ),
  );
}

async function obtenerPagosSisgatPorPlaca(
  placas: Array<string | null>,
): Promise<Map<string, PagoSisgatConsulta[]>> {
  const placasConsulta = Array.from(
    new Set(
      placas.flatMap(
        variantesPlacaPagosSisgat,
      ),
    ),
  );

  if (placasConsulta.length === 0) {
    return new Map();
  }

  const versionPagos =
    await prisma.versionPagosSisgat.findFirst({
      where: {
        estado:
          EstadoVersionDatos.ACTIVA,
      },
      orderBy: {
        fechaAplicacion: "desc",
      },
      select: {
        id: true,
      },
    });

  if (!versionPagos) {
    return new Map();
  }

  const declaraciones =
    await prisma.declaracion.findMany({
      where: {
        versionPagosSisgatId:
          versionPagos.id,
        OR: placasConsulta.map(
          (placa) => ({
            placa: {
              equals: placa,
              mode: "insensitive",
            },
          }),
        ),
      },
      select: {
        id: true,
        anioDeclaracion: true,
        fechaInscripcion: true,
        placa: true,
        recibos: {
          orderBy: [
            {
              anioRecibo: "desc",
            },
            {
              numeroRecibo: "asc",
            },
          ],
          select: {
            id: true,
            anioRecibo: true,
            numeroRecibo: true,
            monto: true,
            trimestreOriginal: true,
            trimestreDesde: true,
            trimestreHasta: true,
            estadoOriginal: true,
            activo: true,
          },
        },
      },
    });

  const registrosPorPlaca = new Map<
    string,
    Map<string, PagoSisgatConsulta>
  >();

  for (const declaracion of declaraciones) {
    const placa =
      normalizarPlacaPagosSisgat(
        declaracion.placa,
      );

    if (!placa) {
      continue;
    }

    const registros =
      registrosPorPlaca.get(placa) ??
      new Map<
        string,
        PagoSisgatConsulta
      >();

    if (declaracion.recibos.length === 0) {
      registros.set(
        `D:${declaracion.id}`,
        {
          declaracionId:
            declaracion.id,
          anioDeclaracion:
            declaracion.anioDeclaracion,
          anioInscripcion:
            declaracion.fechaInscripcion
              ? declaracion.fechaInscripcion.getUTCFullYear()
              : null,
          id: null,
          anioRecibo: null,
          numeroRecibo: null,
          monto: null,
          trimestreOriginal: null,
          trimestreDesde: null,
          trimestreHasta: null,
          estadoOriginal: null,
          activo: false,
        },
      );
    }

    for (
      const recibo of
      declaracion.recibos
    ) {
      registros.set(
        `R:${recibo.id}`,
        {
          declaracionId:
            declaracion.id,
          anioDeclaracion:
            declaracion.anioDeclaracion,
          anioInscripcion:
            declaracion.fechaInscripcion
              ? declaracion.fechaInscripcion.getUTCFullYear()
              : null,
          id: recibo.id,
          anioRecibo:
            recibo.anioRecibo,
          numeroRecibo:
            recibo.numeroRecibo,
          monto: Number(
            recibo.monto,
          ),
          trimestreOriginal:
            recibo.trimestreOriginal,
          trimestreDesde:
            recibo.trimestreDesde,
          trimestreHasta:
            recibo.trimestreHasta,
          estadoOriginal:
            recibo.estadoOriginal,
          activo: recibo.activo,
        },
      );
    }

    registrosPorPlaca.set(
      placa,
      registros,
    );
  }

  const resultado =
    new Map<
      string,
      PagoSisgatConsulta[]
    >();

  for (
    const [placa, registros] of
    registrosPorPlaca.entries()
  ) {
    resultado.set(
      placa,
      Array.from(
        registros.values(),
      ).sort((a, b) => {
        if (
          a.anioDeclaracion !==
          b.anioDeclaracion
        ) {
          return (
            a.anioDeclaracion -
            b.anioDeclaracion
          );
        }

        if (a.activo !== b.activo) {
          return a.activo
            ? -1
            : 1;
        }

        return (
          a.numeroRecibo ?? ""
        ).localeCompare(
          b.numeroRecibo ?? "",
          "es",
        );
      }),
    );
  }

  return resultado;
}

function pagosSisgatDePlaca(
  pagosPorPlaca: Map<
    string,
    PagoSisgatConsulta[]
  >,
  placa: string | null,
): PagoSisgatConsulta[] {
  const clave =
    normalizarPlacaPagosSisgat(
      placa,
    );

  return clave
    ? pagosPorPlaca.get(clave) ??
        []
    : [];
}

function anioInscripcionSisgatDePlaca(
  pagosPorPlaca: Map<
    string,
    PagoSisgatConsulta[]
  >,
  placa: string | null,
): number | null {
  const pagos =
    pagosSisgatDePlaca(
      pagosPorPlaca,
      placa,
    );

  const candidato = pagos
    .filter(
      (pago) =>
        pago.anioInscripcion !==
        null,
    )
    .sort(
      (a, b) =>
        b.anioDeclaracion -
        a.anioDeclaracion,
    )[0];

  return (
    candidato?.anioInscripcion ??
    null
  );
}

function extraerTrimestresPeriodoTributario(
  valor: string | null,
): number[] {
  if (!valor) {
    return [];
  }

  const encontrados = new Set<number>();
  const texto = valor.trim();

  for (
    const coincidencia of texto.matchAll(
      /([1-4])\s*[-–—]\s*([1-4])/g,
    )
  ) {
    const inicio = Number(coincidencia[1]);
    const fin = Number(coincidencia[2]);
    const desde = Math.min(inicio, fin);
    const hasta = Math.max(inicio, fin);

    for (
      let trimestre = desde;
      trimestre <= hasta;
      trimestre += 1
    ) {
      encontrados.add(trimestre);
    }
  }

  for (
    const coincidencia of texto.matchAll(
      /(?:^|\D)([1-4])(?=\D|$)/g,
    )
  ) {
    encontrados.add(Number(coincidencia[1]));
  }

  return [...encontrados].sort(
    (a, b) => a - b,
  );
}

function anioUltimoTributarioSisgatDePlaca(
  pagosPorPlaca: Map<
    string,
    PagoSisgatConsulta[]
  >,
  placa: string | null,
): number | null {
  const anioInscripcion =
    anioInscripcionSisgatDePlaca(
      pagosPorPlaca,
      placa,
    );

  return anioInscripcion === null
    ? null
    : anioInscripcion + 3;
}

function tresAniosPagadosSisgatDePlaca(
  pagosPorPlaca: Map<
    string,
    PagoSisgatConsulta[]
  >,
  placa: string | null,
): boolean | null {
  const anioInscripcion =
    anioInscripcionSisgatDePlaca(
      pagosPorPlaca,
      placa,
    );

  if (anioInscripcion === null) {
    return null;
  }

  const aniosEsperados = [
    anioInscripcion + 1,
    anioInscripcion + 2,
    anioInscripcion + 3,
  ];

  const cobertura =
    new Map<number, Set<number>>();

  for (
    const pago of pagosSisgatDePlaca(
      pagosPorPlaca,
      placa,
    )
  ) {
    if (
      !pago.activo ||
      !aniosEsperados.includes(
        pago.anioDeclaracion,
      )
    ) {
      continue;
    }

    const trimestres =
      cobertura.get(
        pago.anioDeclaracion,
      ) ?? new Set<number>();

    if (
      pago.trimestreDesde !== null &&
      pago.trimestreHasta !== null
    ) {
      const desde = Math.max(
        1,
        pago.trimestreDesde,
      );
      const hasta = Math.min(
        4,
        pago.trimestreHasta,
      );

      for (
        let trimestre = desde;
        trimestre <= hasta;
        trimestre += 1
      ) {
        trimestres.add(trimestre);
      }
    } else {
      for (
        const trimestre of
        extraerTrimestresPeriodoTributario(
          pago.trimestreOriginal,
        )
      ) {
        trimestres.add(trimestre);
      }
    }

    cobertura.set(
      pago.anioDeclaracion,
      trimestres,
    );
  }

  return aniosEsperados.every(
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
}


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

      const limiteSolicitado =
        enteroPositivo(
          req.query.limite,
          20,
        );

      const limite = Math.min(
        limiteSolicitado,
        100,
      );

      const buscar = String(
        req.query.buscar ?? "",
      ).trim();

      const estadoTexto = String(
        req.query.estado ?? "",
      ).trim();

      const anioOrden = Number(
        req.query.anioOrden,
      );

      const periodoAnio = Number(
        req.query.periodoAnio,
      );

      const where:
        Prisma.OrdenPagoWhereInput = {};

      if (buscar) {
        const placaNormalizada =
          normalizarPlacaBusqueda(buscar);

        where.OR = [
          {
            numeroOrden: {
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
              contains: placaNormalizada,
              mode: "insensitive",
            },
          },
        ];
      }

      if (
        Object.values(
          EstadoConciliacion,
        ).includes(
          estadoTexto as EstadoConciliacion,
        )
      ) {
        where.estado =
          estadoTexto as EstadoConciliacion;
      }

      if (
        Number.isInteger(anioOrden)
      ) {
        where.anioOrden = anioOrden;
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

      const [total, ordenes] =
        await Promise.all([
          prisma.ordenPago.count({
            where,
          }),

          prisma.ordenPago.findMany({
            where,
            skip: (pagina - 1) * limite,
            take: limite,
            orderBy: [
              {
                anioOrden: "desc",
              },
              {
                numeroOrden: "desc",
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
              _count: {
                select: {
                  detalles: true,
                },
              },
            },
          }),
        ]);

      const pagosSisgatPorPlaca =
        await obtenerPagosSisgatPorPlaca(
          ordenes.map(
            (orden) => orden.placa,
          ),
        );

      res.status(200).json({
        ok: true,
        data: {
          registros: ordenes.map(
            (orden) => ({
              id: orden.id,
              anioOrden:
                orden.anioOrden,
              numeroOrden:
                orden.numeroOrden,
              fechaEmision:
                orden.fechaEmision,
              dniRuc:
                orden.dniRucOriginal,
              nombre:
                orden.nombreOriginal,
              placa: orden.placa,
              pagosSisgat:
                pagosSisgatDePlaca(
                  pagosSisgatPorPlaca,
                  orden.placa,
                ),
              anioInscripcion:
                anioInscripcionSisgatDePlaca(
                  pagosSisgatPorPlaca,
                  orden.placa,
                ),
              anioUltimoTributario:
                anioUltimoTributarioSisgatDePlaca(
                  pagosSisgatPorPlaca,
                  orden.placa,
                ),
              tresAniosPagados:
                tresAniosPagadosSisgatDePlaca(
                  pagosSisgatPorPlaca,
                  orden.placa,
                ),
              periodo:
                orden.periodoOriginal,
              importeTotal: Number(
                orden.importeTotal,
              ),
              totalPagado: Number(
                orden.totalPagado,
              ),
              saldo: Number(
                orden.saldo,
              ),
              estado: orden.estado,
              activoOriginal:
                orden.activoOriginal,
              cantidadDetalles:
                orden._count.detalles,
              contribuyente:
                orden.contribuyente,
            }),
          ),

          paginacion: {
            pagina,
            limite,
            total,
            totalPaginas:
              Math.ceil(total / limite),
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
      const id = Number(req.params.id);

      if (
        !Number.isInteger(id) ||
        id <= 0
      ) {
        res.status(400).json({
          ok: false,
          message:
            "El identificador de la orden no es válido.",
        });
        return;
      }

      const orden =
        await prisma.ordenPago.findUnique({
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
                  trimestreDesde: "asc",
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

      if (!orden) {
        res.status(404).json({
          ok: false,
          message:
            "No se encontró la orden solicitada.",
        });
        return;
      }

      res.status(200).json({
        ok: true,
        data: {
          id: orden.id,
          anioOrden:
            orden.anioOrden,
          numeroOrden:
            orden.numeroOrden,
          fechaEmision:
            orden.fechaEmision,
          dniRuc:
            orden.dniRucOriginal,
          nombre:
            orden.nombreOriginal,
          direccion:
            orden.direccionOriginal,
          placa: orden.placa,
          fechaSunarp:
            orden.fechaSunarp,
          activoOriginal:
            orden.activoOriginal,
          periodoOriginal:
            orden.periodoOriginal,
          importeTotal: Number(
            orden.importeTotal,
          ),
          totalPagado: Number(
            orden.totalPagado,
          ),
          saldo: Number(
            orden.saldo,
          ),
          estado: orden.estado,
          contribuyente:
            orden.contribuyente,

          detalles:
            orden.detalles.map(
              (detalle) => ({
                id: detalle.id,
                periodoAnio:
                  detalle.periodoAnio,
                periodoOriginal:
                  detalle.periodoOriginal,
                trimestreDesde:
                  detalle.trimestreDesde,
                trimestreHasta:
                  detalle.trimestreHasta,
                valorReferencial:
                  detalle.valorReferencial ===
                  null
                    ? null
                    : Number(
                        detalle.valorReferencial,
                      ),
                impuesto:
                  detalle.impuesto === null
                    ? null
                    : Number(
                        detalle.impuesto,
                      ),
                reajuste:
                  detalle.reajuste === null
                    ? null
                    : Number(
                        detalle.reajuste,
                      ),
                interes:
                  detalle.interes === null
                    ? null
                    : Number(
                        detalle.interes,
                      ),
                gastosAdmin:
                  detalle.gastosAdmin === null
                    ? null
                    : Number(
                        detalle.gastosAdmin,
                      ),
                totalPeriodo: Number(
                  detalle.totalPeriodo,
                ),
                montoPagado: Number(
                  detalle.montoPagado,
                ),
                saldo: Number(
                  detalle.saldo,
                ),
                estado:
                  detalle.estado,
                observacion:
                  detalle.observacion,

                declaracion:
                  detalle.declaracion
                    ? {
                        id:
                          detalle
                            .declaracion.id,
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
                                    recibo.monto,
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
                                  recibo.activo,
                              }),
                            ),
                      }
                    : null,
              }),
            ),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

export {
  router as ordenesRouter,
};
