import {
  useState,
} from "react";

import ReporteLiquidaciones from "./ReporteLiquidaciones";
import ReporteOrdenes from "./ReporteOrdenes";
import ReporteRequerimientosManuales from "./ReporteRequerimientosManuales";
import ReporteRequerimientosSisgat from "./ReporteRequerimientosSisgat";

import "./CentroReportes.css";

type TipoReporte =
  | "ordenes"
  | "liquidaciones"
  | "requerimientos-sisgat"
  | "requerimientos-manuales";

export default function Reportes() {
  const [
    tipoReporte,
    setTipoReporte,
  ] =
    useState<TipoReporte>(
      "ordenes",
    );

  return (
    <div className="centro-reportes">
      <section className="centro-reportes-selector">
        <header>
          <div>
            <p className="pagina-etiqueta">
              Centro de reportes
            </p>

            <h2>
              Reportes independientes
            </h2>

            <p>
              Cada reporte consulta únicamente la versión activa de su propia
              fuente de información.
            </p>
          </div>

          <span>
            Excel por módulo
          </span>
        </header>

        <nav
          aria-label="Tipos de reporte"
        >
          <button
            type="button"
            className={
              tipoReporte ===
              "ordenes"
                ? "centro-reportes-opcion centro-reportes-opcion-activa"
                : "centro-reportes-opcion"
            }
            onClick={() =>
              setTipoReporte(
                "ordenes",
              )
            }
          >
            <strong>
              Órdenes
            </strong>

            <small>
              Órdenes, periodos y pagos
            </small>
          </button>

          <button
            type="button"
            className={
              tipoReporte ===
              "liquidaciones"
                ? "centro-reportes-opcion centro-reportes-opcion-activa"
                : "centro-reportes-opcion"
            }
            onClick={() =>
              setTipoReporte(
                "liquidaciones",
              )
            }
          >
            <strong>
              Liquidaciones
            </strong>

            <small>
              Liquidaciones, periodos y pagos
            </small>
          </button>

          <button
            type="button"
            className={
              tipoReporte ===
              "requerimientos-sisgat"
                ? "centro-reportes-opcion centro-reportes-opcion-activa"
                : "centro-reportes-opcion"
            }
            onClick={() =>
              setTipoReporte(
                "requerimientos-sisgat",
              )
            }
          >
            <strong>
              Requerimientos SisGAT
            </strong>

            <small>
              Reporte oficial, periodos y pagos
            </small>
          </button>

          <button
            type="button"
            className={
              tipoReporte ===
              "requerimientos-manuales"
                ? "centro-reportes-opcion centro-reportes-opcion-activa"
                : "centro-reportes-opcion"
            }
            onClick={() =>
              setTipoReporte(
                "requerimientos-manuales",
              )
            }
          >
            <strong>
              Requerimientos manuales
            </strong>

            <small>
              Conciliación, revisión y notificación
            </small>
          </button>
        </nav>
      </section>

      {tipoReporte ===
      "ordenes" ? (
        <ReporteOrdenes />
      ) : tipoReporte ===
        "liquidaciones" ? (
        <ReporteLiquidaciones />
      ) : tipoReporte ===
        "requerimientos-sisgat" ? (
        <ReporteRequerimientosSisgat />
      ) : (
        <ReporteRequerimientosManuales />
      )}
    </div>
  );
}
