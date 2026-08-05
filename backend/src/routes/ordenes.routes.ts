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