import {
  EstadoConciliacionManual,
  EstadoNotificacionManual,
  EstadoRevisionManual,
  Prisma,
  TipoRegistroManual,
} from "../../generated/prisma/client";
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import type {
  SesionPublica,
} from "../services/auth.service";
import {
  analizarAniosRequerimientoManual,
  normalizarPlacaManual,
  type DeclaracionHistorialManual,
} from "../services/historial-pagos-requerimientos-manuales.service";

export const requerimientosManualesRouter =
  Router();

interface AuthLocals {
  sesion?: SesionPublica;
}

function sesionActual(
  res: Response,
): SesionPublica | null {
  return (
    (res.locals as AuthLocals)
      .sesion ?? null
  );
}

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

function textoOpcional(
  valor: unknown,
): string {
  return String(valor ?? "")
    .trim();
}

function enumValido<T extends string>(
  valores: readonly T[],
  valor: string,
): valor is T {
  return valores.includes(
    valor as T,
  );
}

function numeroMoneda(
  valor:
    Prisma.Decimal |
    number,
): number {
  return Number(valor);
}

const seguimientoSchema = z.object({
  estadoNotificacion:
    z.enum(
      EstadoNotificacionManual,
    ),

  notificador: z
    .string()
    .trim()
    .max(150)
    .nullable()
    .optional(),

  responsable: z
    .string()
    .trim()
    .max(150)
    .nullable()
    .optional(),

  numeroLiquidacionDeuda:
    z.string()
      .trim()
      .max(100)
      .nullable()
      .optional(),

  fechaNotificacion:
    z.union([
      z.string()
        .regex(
          /^\d{4}-\d{2}-\d{2}$/,
          "La fecha debe tener formato AAAA-MM-DD.",
        ),
      z.literal(""),
      z.null(),
    ])
      .optional(),

  numeroCedulon:
    z.string()
      .trim()
      .max(150)
      .nullable()
      .optional(),

  observacion:
    z.string()
      .trim()
      .max(3000)
      .nullable()
      .optional(),
});

function fechaOpcional(
  valor:
    string |
    null |
    undefined,
): Date | null {
  if (!valor) {
    return null;
  }

  const fecha =
    new Date(
      `${valor}T00:00:00.000Z`,
    );

  if (
    Number.isNaN(
      fecha.getTime(),
    )
  ) {
    return null;
  }

  return fecha;
}

function limpiarNullable(
  valor:
    string |
    null |
    undefined,
): string | null {
  const texto =
    valor?.trim() ?? "";

  return texto || null;
}

async function obtenerDetalle(
  id: number,
) {
  const registro =
    await prisma
      .requerimientoManual
      .findUnique({
        where: {
          id,
        },
        include: {
          versionRequerimientosManuales: {
            select: {
              id: true,
              codigo: true,
              estado: true,
              anioGestion: true,
              fechaAplicacion: true,
            },
          },
          periodos: {
            orderBy: {
              periodoAnio:
                "asc",
            },
            include: {
              declaracion: {
                select: {
                  id: true,
                  anioDeclaracion: true,
                  numeroDeclaracion: true,
                  dniRuc: true,
                  nombresRazonSocial: true,
                  placa: true,
                  recibos: {
                    orderBy: [
                      {
                        anioRecibo:
                          "asc",
                      },
                      {
                        numeroRecibo:
                          "asc",
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
              },
            },
          },
          seguimientos: {
            orderBy: {
              createdAt:
                "desc",
            },
            include: {
              usuario: {
                select: {
                  id: true,
                  nombre: true,
                  nombreUsuario: true,
                },
              },
            },
          },
          historial: {
            orderBy: {
              createdAt:
                "desc",
            },
            take: 100,
            include: {
              usuario: {
                select: {
                  id: true,
                  nombre: true,
                  nombreUsuario: true,
                },
              },
            },
          },
          _count: {
            select: {
              periodos: true,
              seguimientos: true,
              historial: true,
            },
          },
        },
      });

  if (!registro) {
    return null;
  }

  const placaHistorial =
    normalizarPlacaManual(
      registro
        .placaNormalizada ??
      registro
        .placaOriginal,
    );

  const declaracionesHistorial =
    placaHistorial
      ? await prisma
          .declaracion
          .findMany({
            where: {
              placa:
                placaHistorial,
            },
            include: {
              recibos: true,
            },
            orderBy: [
              {
                anioDeclaracion:
                  "asc",
              },
              {
                id: "asc",
              },
            ],
          })
      : [];

  const analisisAnios =
    analizarAniosRequerimientoManual({
      placa:
        placaHistorial,
      propietarioManual:
        registro
          .propietarioOriginal,
      aniosManual:
        registro.periodos.map(
          (periodo) =>
            periodo.periodoAnio,
        ),
      declaraciones:
        declaracionesHistorial,
    });

  return {
    ...registro,
    analisisAnios,
    periodos:
      registro.periodos.map(
        (periodo) => ({
          ...periodo,
          montoPagado:
            numeroMoneda(
              periodo.montoPagado,
            ),
          declaracion:
            periodo.declaracion
              ? {
                  ...periodo
                    .declaracion,
                  recibos:
                    periodo
                      .declaracion
                      .recibos.map(
                        (recibo) => ({
                          ...recibo,
                          monto:
                            numeroMoneda(
                              recibo.monto,
                            ),
                        }),
                      ),
                }
              : null,
        })),
  };
}

requerimientosManualesRouter.get(
  "/resumen",
  async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const [
        totalRegistros,
        totalPeriodos,
        porTipo,
        porEstado,
        porRevision,
        porNotificacion,
      ] = await Promise.all([
        prisma
          .requerimientoManual
          .count(),

        prisma
          .requerimientoManualPeriodo
          .count(),

        prisma
          .requerimientoManual
          .groupBy({
            by: [
              "tipoRegistro",
            ],
            _count: {
              _all: true,
            },
          }),

        prisma
          .requerimientoManual
          .groupBy({
            by: [
              "estadoConciliado",
            ],
            _count: {
              _all: true,
            },
          }),

        prisma
          .requerimientoManual
          .groupBy({
            by: [
              "estadoRevision",
            ],
            _count: {
              _all: true,
            },
          }),

        prisma
          .requerimientoManual
          .groupBy({
            by: [
              "estadoNotificacion",
            ],
            _count: {
              _all: true,
            },
          }),
      ]);

      res.status(200).json({
        ok: true,
        data: {
          totalRegistros,
          totalPeriodos,
          porTipo:
            porTipo.map(
              (item) => ({
                estado:
                  item.tipoRegistro,
                cantidad:
                  item._count._all,
              }),
            ),
          porEstadoConciliado:
            porEstado.map(
              (item) => ({
                estado:
                  item
                    .estadoConciliado,
                cantidad:
                  item._count._all,
              }),
            ),
          porEstadoRevision:
            porRevision.map(
              (item) => ({
                estado:
                  item.estadoRevision,
                cantidad:
                  item._count._all,
              }),
            ),
          porEstadoNotificacion:
            porNotificacion.map(
              (item) => ({
                estado:
                  item
                    .estadoNotificacion,
                cantidad:
                  item._count._all,
              }),
            ),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

requerimientosManualesRouter.get(
  "/",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const pagina =
        enteroPositivo(
          req.query.pagina,
          1,
        );

      const limite =
        Math.min(
          enteroPositivo(
            req.query.limite,
            20,
          ),
          100,
        );

      const buscar =
        textoOpcional(
          req.query.buscar,
        );

      const tipoRegistro =
        textoOpcional(
          req.query.tipoRegistro,
        );

      const estadoConciliado =
        textoOpcional(
          req.query.estadoConciliado,
        );

      const estadoRevision =
        textoOpcional(
          req.query.estadoRevision,
        );

      const estadoNotificacion =
        textoOpcional(
          req.query.estadoNotificacion,
        );

      const periodoAnio =
        Number(
          req.query.periodoAnio,
        );

      const where:
        Prisma.RequerimientoManualWhereInput =
          {};

      if (buscar) {
        const placaCompacta =
          buscar
            .toUpperCase()
            .replace(
              /[^A-Z0-9]/g,
              "",
            );

        const placaNormalizada =
          placaCompacta.length ===
          6
            ? `${placaCompacta.slice(
                0,
                3,
              )}-${placaCompacta.slice(
                3,
              )}`
            : buscar;

        where.OR = [
          {
            numeroRequerimiento: {
              contains: buscar,
              mode: "insensitive",
            },
          },
          {
            placaOriginal: {
              contains: buscar,
              mode: "insensitive",
            },
          },
          {
            placaNormalizada: {
              contains:
                placaNormalizada,
              mode: "insensitive",
            },
          },
          {
            propietarioOriginal: {
              contains: buscar,
              mode: "insensitive",
            },
          },
          {
            deudaOriginal: {
              contains: buscar,
              mode: "insensitive",
            },
          },
          {
            notificadorActual: {
              contains: buscar,
              mode: "insensitive",
            },
          },
          {
            responsableActual: {
              contains: buscar,
              mode: "insensitive",
            },
          },
          {
            numeroCedulonActual: {
              contains: buscar,
              mode: "insensitive",
            },
          },
          {
            numeroLiquidacionDeudaActual: {
              contains: buscar,
              mode: "insensitive",
            },
          },
        ];
      }

      if (
        enumValido(
          Object.values(
            TipoRegistroManual,
          ) as TipoRegistroManual[],
          tipoRegistro,
        )
      ) {
        where.tipoRegistro =
          tipoRegistro;
      }

      if (
        enumValido(
          Object.values(
            EstadoConciliacionManual,
          ) as EstadoConciliacionManual[],
          estadoConciliado,
        )
      ) {
        where.estadoConciliado =
          estadoConciliado;
      }

      if (
        enumValido(
          Object.values(
            EstadoRevisionManual,
          ) as EstadoRevisionManual[],
          estadoRevision,
        )
      ) {
        where.estadoRevision =
          estadoRevision;
      }

      if (
        enumValido(
          Object.values(
            EstadoNotificacionManual,
          ) as EstadoNotificacionManual[],
          estadoNotificacion,
        )
      ) {
        where.estadoNotificacion =
          estadoNotificacion;
      }

      if (
        Number.isInteger(
          periodoAnio,
        )
      ) {
        where.periodos = {
          some: {
            periodoAnio,
          },
        };
      }

      const [
        total,
        registros,
      ] = await Promise.all([
        prisma
          .requerimientoManual
          .count({
            where,
          }),

        prisma
          .requerimientoManual
          .findMany({
            where,
            skip:
              (pagina - 1) *
              limite,
            take: limite,
            orderBy: [
              {
                anioGestion:
                  "desc",
              },
              {
                numeroRequerimiento:
                  "asc",
              },
            ],
            select: {
              id: true,
              anioGestion: true,
              numeroRequerimiento: true,
              placaOriginal: true,
              placaNormalizada: true,
              fechaRequerimiento: true,
              deudaOriginal: true,
              propietarioOriginal: true,
              estadoManualOriginal: true,
              tipoRegistro: true,
              estadoConciliado: true,
              estadoRevision: true,
              estadoNotificacion: true,
              notificadorActual: true,
              responsableActual: true,
              numeroCedulonActual: true,
              filaOrigen: true,
              periodos: {
                orderBy: {
                  periodoAnio:
                    "asc",
                },
                select: {
                  periodoAnio:
                    true,
                },
              },
              _count: {
                select: {
                  periodos: true,
                  seguimientos: true,
                  historial: true,
                },
              },
            },
          }),
      ]);

      const placasPagina =
        [
          ...new Set(
            registros
              .map(
                (registro) =>
                  normalizarPlacaManual(
                    registro
                      .placaNormalizada ??
                    registro
                      .placaOriginal,
                  ),
              )
              .filter(Boolean),
          ),
        ];

      const declaracionesPagina:
        DeclaracionHistorialManual[] =
        placasPagina.length > 0
          ? await prisma
              .declaracion
              .findMany({
                where: {
                  placa: {
                    in:
                      placasPagina,
                  },
                },
                include: {
                  recibos: true,
                },
                orderBy: [
                  {
                    placa: "asc",
                  },
                  {
                    anioDeclaracion:
                      "asc",
                  },
                  {
                    id: "asc",
                  },
                ],
              })
          : [];

      const declaracionesPorPlaca =
        new Map<
          string,
          DeclaracionHistorialManual[]
        >();

      for (
        const declaracion
        of declaracionesPagina
      ) {
        const placa =
          normalizarPlacaManual(
            declaracion.placa,
          );

        if (!placa) {
          continue;
        }

        const grupo =
          declaracionesPorPlaca.get(
            placa,
          ) ?? [];

        grupo.push(
          declaracion,
        );

        declaracionesPorPlaca.set(
          placa,
          grupo,
        );
      }

      const registrosConAnalisis =
        registros.map(
          (registro) => {
            const placa =
              normalizarPlacaManual(
                registro
                  .placaNormalizada ??
                registro
                  .placaOriginal,
              );

            const {
              periodos,
              ...datosRegistro
            } = registro;

            return {
              ...datosRegistro,
              analisisAnios:
                analizarAniosRequerimientoManual({
                  placa,
                  propietarioManual:
                    registro
                      .propietarioOriginal,
                  aniosManual:
                    periodos.map(
                      (periodo) =>
                        periodo
                          .periodoAnio,
                    ),
                  declaraciones:
                    declaracionesPorPlaca.get(
                      placa,
                    ) ?? [],
                }),
            };
          },
        );

      res.status(200).json({
        ok: true,
        data: {
          registros:
            registrosConAnalisis,
          paginacion: {
            pagina,
            limite,
            total,
            totalPaginas:
              total === 0
                ? 0
                : Math.ceil(
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

requerimientosManualesRouter.get(
  "/:id",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const id =
        Number(req.params.id);

      if (
        !Number.isInteger(id) ||
        id <= 0
      ) {
        res.status(400).json({
          ok: false,
          message:
            "El identificador del requerimiento manual no es válido.",
          data: null,
        });

        return;
      }

      const registro =
        await obtenerDetalle(id);

      if (!registro) {
        res.status(404).json({
          ok: false,
          message:
            "No se encontró el requerimiento manual.",
          data: null,
        });

        return;
      }

      res.status(200).json({
        ok: true,
        data: registro,
      });
    } catch (error) {
      next(error);
    }
  },
);

requerimientosManualesRouter.patch(
  "/:id/seguimiento",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sesion =
        sesionActual(res);

      if (
        !sesion ||
        sesion.rol ===
          "INVITADO" ||
        !sesion.usuario
      ) {
        res.status(403).json({
          ok: false,
          message:
            "El acceso de invitado es únicamente de consulta.",
          data: null,
        });

        return;
      }

      const id =
        Number(req.params.id);

      if (
        !Number.isInteger(id) ||
        id <= 0
      ) {
        res.status(400).json({
          ok: false,
          message:
            "El identificador del requerimiento manual no es válido.",
          data: null,
        });

        return;
      }

      const validacion =
        seguimientoSchema.safeParse(
          req.body,
        );

      if (!validacion.success) {
        res.status(400).json({
          ok: false,
          message:
            validacion.error
              .issues[0]
              ?.message ??
            "Los datos del seguimiento no son válidos.",
          data: null,
        });

        return;
      }

      const actual =
        await prisma
          .requerimientoManual
          .findUnique({
            where: {
              id,
            },
            select: {
              id: true,
              estadoNotificacion: true,
              notificadorActual: true,
              responsableActual: true,
              numeroLiquidacionDeudaActual: true,
              fechaNotificacionActual: true,
              numeroCedulonActual: true,
              observacionSeguimiento: true,
            },
          });

      if (!actual) {
        res.status(404).json({
          ok: false,
          message:
            "No se encontró el requerimiento manual.",
          data: null,
        });

        return;
      }

      const datos =
        validacion.data;

      const nuevos = {
        estadoNotificacion:
          datos.estadoNotificacion,
        notificador:
          limpiarNullable(
            datos.notificador,
          ),
        responsable:
          limpiarNullable(
            datos.responsable,
          ),
        numeroLiquidacionDeuda:
          limpiarNullable(
            datos.numeroLiquidacionDeuda,
          ),
        fechaNotificacion:
          fechaOpcional(
            datos.fechaNotificacion,
          ),
        numeroCedulon:
          limpiarNullable(
            datos.numeroCedulon,
          ),
        observacion:
          limpiarNullable(
            datos.observacion,
          ),
      };

      await prisma.$transaction(
        async (tx) => {
          await tx
            .requerimientoManual
            .update({
              where: {
                id,
              },
              data: {
                estadoNotificacion:
                  nuevos
                    .estadoNotificacion,
                notificadorActual:
                  nuevos.notificador,
                responsableActual:
                  nuevos.responsable,
                numeroLiquidacionDeudaActual:
                  nuevos
                    .numeroLiquidacionDeuda,
                fechaNotificacionActual:
                  nuevos
                    .fechaNotificacion,
                numeroCedulonActual:
                  nuevos.numeroCedulon,
                observacionSeguimiento:
                  nuevos.observacion,
              },
            });

          await tx
            .seguimientoRequerimientoManual
            .create({
              data: {
                requerimientoManualId:
                  id,
                usuarioId:
                  sesion.usuario!.id,
                estadoNotificacion:
                  nuevos
                    .estadoNotificacion,
                notificador:
                  nuevos.notificador,
                responsable:
                  nuevos.responsable,
                numeroLiquidacionDeuda:
                  nuevos
                    .numeroLiquidacionDeuda,
                fechaNotificacion:
                  nuevos
                    .fechaNotificacion,
                numeroCedulon:
                  nuevos.numeroCedulon,
                observacion:
                  nuevos.observacion,
              },
            });

          await tx
            .historialRequerimientoManual
            .create({
              data: {
                requerimientoManualId:
                  id,
                usuarioId:
                  sesion.usuario!.id,
                accion:
                  "ACTUALIZAR_SEGUIMIENTO",
                campo:
                  "seguimiento",
                valorAnterior:
                  JSON.stringify(
                    actual,
                  ),
                valorNuevo:
                  JSON.stringify(
                    nuevos,
                  ),
                motivo:
                  nuevos.observacion ??
                  "Actualización del seguimiento operativo.",
                detalles: {
                  origen:
                    "PANTALLA_REQUERIMIENTOS_MANUALES",
                } satisfies Prisma.InputJsonObject,
              },
            });

          await tx.auditoria.create({
            data: {
              usuarioId:
                sesion.usuario!.id,
              accion:
                "ACTUALIZAR_SEGUIMIENTO_REQUERIMIENTO_MANUAL",
              entidad:
                "REQUERIMIENTO_MANUAL",
              entidadId:
                String(id),
              resultado:
                "CORRECTO",
              detalles: {
                estadoNotificacion:
                  nuevos
                    .estadoNotificacion,
              } satisfies Prisma.InputJsonObject,
            },
          });
        },
        {
          maxWait: 10000,
          timeout: 120000,
        },
      );

      const actualizado =
        await obtenerDetalle(id);

      res.status(200).json({
        ok: true,
        message:
          "Seguimiento actualizado correctamente.",
        data: actualizado,
      });
    } catch (error) {
      next(error);
    }
  },
);
