import "./PagosSisgatCelda.css";

export interface PagoSisgatVisual {
  declaracionId: number;
  anioDeclaracion: number;
  id: number | null;
  anioRecibo: number | null;
  numeroRecibo: string | null;
  monto: number | null;
  trimestreOriginal: string | null;
  estadoOriginal: string | null;
  activo: boolean;
}

interface PagosSisgatCeldaProps {
  pagos: PagoSisgatVisual[];
}

interface CoberturaAnual {
  anio: number;
  trimestres: Set<number>;
  etiquetasSinConvertir: Set<string>;
}

function extraerTrimestres(
  valor: string | null,
): number[] {
  if (!valor) {
    return [];
  }

  const encontrados =
    new Set<number>();
  const texto = valor.trim();

  for (
    const coincidencia of
    texto.matchAll(
      /([1-4])\s*[-–—]\s*([1-4])/g,
    )
  ) {
    const inicio = Number(
      coincidencia[1],
    );
    const fin = Number(
      coincidencia[2],
    );
    const desde = Math.min(
      inicio,
      fin,
    );
    const hasta = Math.max(
      inicio,
      fin,
    );

    for (
      let trimestre = desde;
      trimestre <= hasta;
      trimestre += 1
    ) {
      encontrados.add(
        trimestre,
      );
    }
  }

  for (
    const coincidencia of
    texto.matchAll(
      /(?:^|\D)([1-4])(?=\D|$)/g,
    )
  ) {
    encontrados.add(
      Number(
        coincidencia[1],
      ),
    );
  }

  return [...encontrados].sort(
    (a, b) => a - b,
  );
}

function resumirTrimestres(
  trimestres: Iterable<number>,
): string {
  const valores = [
    ...new Set([...trimestres]),
  ]
    .filter(
      (valor) =>
        Number.isInteger(valor) &&
        valor >= 1 &&
        valor <= 4,
    )
    .sort((a, b) => a - b);

  if (valores.length === 0) {
    return "—";
  }

  const segmentos: string[] = [];
  let inicio = valores[0];
  let anterior = valores[0];

  for (
    let indice = 1;
    indice < valores.length;
    indice += 1
  ) {
    const actual = valores[indice];

    if (actual === anterior + 1) {
      anterior = actual;
      continue;
    }

    segmentos.push(
      inicio === anterior
        ? String(inicio)
        : `${inicio}-${anterior}`,
    );

    inicio = actual;
    anterior = actual;
  }

  segmentos.push(
    inicio === anterior
      ? String(inicio)
      : `${inicio}-${anterior}`,
  );

  return segmentos.join(",");
}

function limpiarEtiquetaOriginal(
  valor: string | null,
): string | null {
  const texto = valor
    ?.trim()
    .replace(/^\[\s*/, "")
    .replace(/\s*\]$/, "")
    .trim();

  return texto || null;
}

function construirHistorial(
  pagos: PagoSisgatVisual[],
): string {
  const coberturas =
    new Map<number, CoberturaAnual>();

  for (const pago of pagos) {
    if (
      !Number.isInteger(
        pago.anioDeclaracion,
      )
    ) {
      continue;
    }

    let cobertura =
      coberturas.get(
        pago.anioDeclaracion,
      );

    if (!cobertura) {
      cobertura = {
        anio:
          pago.anioDeclaracion,
        trimestres:
          new Set<number>(),
        etiquetasSinConvertir:
          new Set<string>(),
      };

      coberturas.set(
        pago.anioDeclaracion,
        cobertura,
      );
    }

    if (!pago.activo) {
      continue;
    }

    const trimestres =
      extraerTrimestres(
        pago.trimestreOriginal,
      );

    if (trimestres.length > 0) {
      for (
        const trimestre of
        trimestres
      ) {
        cobertura.trimestres.add(
          trimestre,
        );
      }
    } else {
      const etiqueta =
        limpiarEtiquetaOriginal(
          pago.trimestreOriginal,
        );

      if (etiqueta) {
        cobertura
          .etiquetasSinConvertir
          .add(etiqueta);
      }
    }
  }

  if (coberturas.size === 0) {
    return "Sin datos SisGAT";
  }

  return [
    ...coberturas.values(),
  ]
    .sort(
      (a, b) => a.anio - b.anio,
    )
    .map((cobertura) => {
      if (
        cobertura.trimestres.size >
        0
      ) {
        return `${cobertura.anio} [${resumirTrimestres(
          cobertura.trimestres,
        )}]`;
      }

      if (
        cobertura
          .etiquetasSinConvertir
          .size > 0
      ) {
        return `${cobertura.anio} [${[
          ...cobertura
            .etiquetasSinConvertir,
        ].join(", ")}]`;
      }

      return `${cobertura.anio} [no hay pagos]`;
    })
    .join(" · ");
}

function textoCantidad(
  cantidad: number,
  singular: string,
): string {
  return `${cantidad} ${singular}${
    cantidad === 1 ? "" : "s"
  }`;
}

export function PagosSisgatCelda({
  pagos,
}: PagosSisgatCeldaProps) {
  if (pagos.length === 0) {
    return (
      <span className="pagos-sisgat-vacio">
        Sin datos SisGAT
      </span>
    );
  }

  const noActivos =
    pagos.filter(
      (pago) =>
        pago.id !== null &&
        !pago.activo,
    ).length;

  const historial =
    construirHistorial(pagos);

  return (
    <div className="pagos-sisgat-celda">
      <strong>{historial}</strong>

      {noActivos > 0 ? (
        <small>
          {textoCantidad(
            noActivos,
            "recibo no activo",
          )}
        </small>
      ) : null}
    </div>
  );
}
