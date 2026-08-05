import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { prisma } from "../lib/prisma";

const router = Router();

router.get(
  "/resumen",
  async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const [
        totalOrdenes,
        totalContribuyentes,
        totales,
        ordenesPorEstado,
        ultimasImportaciones,
      ] = await Promise.all([
        prisma.ordenPago.count(),

        prisma.contribuyente.count(),

        prisma.ordenPago.aggregate({
          _sum: {
            importeTotal: true,
            totalPagado: true,
            saldo: true,
          },
        }),

        prisma.ordenPago.groupBy({
          by: ["estado"],
          _count: {
            _all: true,
          },
          _sum: {
            importeTotal: true,
            totalPagado: true,
            saldo: true,
          },
          orderBy: {
            estado: "asc",
          },
        }),

        prisma.importacion.findMany({
          take: 5,
          orderBy: {
            fechaImportacion: "desc",
          },
          select: {
            id: true,
            tipo: true,
            origen: true,
            estado: true,
            nombreArchivo: true,
            totalFilas: true,
            filasCorrectas: true,
            filasConError: true,
            fechaImportacion: true,
            fechaFinalizacion: true,
          },
        }),
      ]);

      res.status(200).json({
        ok: true,
        data: {
          totalOrdenes,
          totalContribuyentes,

          montos: {
            importeTotal: Number(
              totales._sum.importeTotal ?? 0,
            ),
            totalPagado: Number(
              totales._sum.totalPagado ?? 0,
            ),
            saldo: Number(
              totales._sum.saldo ?? 0,
            ),
          },

          ordenesPorEstado:
            ordenesPorEstado.map((item) => ({
              estado: item.estado,
              cantidad: item._count._all,
              importeTotal: Number(
                item._sum.importeTotal ?? 0,
              ),
              totalPagado: Number(
                item._sum.totalPagado ?? 0,
              ),
              saldo: Number(
                item._sum.saldo ?? 0,
              ),
            })),

          ultimasImportaciones,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

export {
  router as dashboardRouter,
};