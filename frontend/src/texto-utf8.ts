const REEMPLAZOS_DIRECTOS: ReadonlyArray<
  readonly [string, string]
> = [
  ["ÃƒÂ¡", "á"],
  ["ÃƒÂ©", "é"],
  ["ÃƒÂ­", "í"],
  ["ÃƒÂ³", "ó"],
  ["ÃƒÂº", "ú"],
  ["ÃƒÂ±", "ñ"],
  ["ÃƒÂ", "Á"],
  ["ÃƒÂ‰", "É"],
  ["ÃƒÂ", "Í"],
  ["ÃƒÂ“", "Ó"],
  ["ÃƒÂš", "Ú"],
  ["ÃƒÂ‘", "Ñ"],
  ["Ãƒâ€œ", "Ó"],
  ["Ãƒâ€°", "É"],
  ["â€”", "—"],
  ["â€“", "–"],
  ["â€¦", "…"],
  ["â€œ", "“"],
  ["â€", "”"],
  ["â€˜", "‘"],
  ["â€™", "’"],
  ["Â¿", "¿"],
  ["Â¡", "¡"],
  ["Â°", "°"],
  ["Â·", "·"],
] as const;

function cantidadSospechosa(
  valor: string,
): number {
  return (
    valor.match(/[ÃÂâ�]/g) ??
    []
  ).length;
}

function decodificarLatin1ComoUtf8(
  valor: string,
): string | null {
  try {
    const bytes =
      Uint8Array.from(
        Array.from(valor),
        (caracter) =>
          caracter.charCodeAt(0) &
          0xff,
      );

    return new TextDecoder(
      "utf-8",
      {
        fatal: true,
      },
    ).decode(bytes);
  } catch {
    return null;
  }
}

export function repararTextoUtf8(
  valor: string,
): string {
  let actual = valor;

  for (
    const [origen, destino]
    of REEMPLAZOS_DIRECTOS
  ) {
    actual =
      actual.replaceAll(
        origen,
        destino,
      );
  }

  for (
    let intento = 0;
    intento < 2;
    intento += 1
  ) {
    if (!/[ÃÂ]/.test(actual)) {
      break;
    }

    const candidato =
      decodificarLatin1ComoUtf8(
        actual,
      );

    if (
      candidato === null ||
      candidato.includes("�") ||
      cantidadSospechosa(
        candidato,
      ) >=
        cantidadSospechosa(
          actual,
        )
    ) {
      break;
    }

    actual = candidato;
  }

  return actual;
}

export function repararValorUtf8<T>(
  valor: T,
): T {
  if (typeof valor === "string") {
    return repararTextoUtf8(
      valor,
    ) as T;
  }

  if (Array.isArray(valor)) {
    return valor.map(
      (item) =>
        repararValorUtf8(item),
    ) as T;
  }

  if (
    typeof valor === "object" &&
    valor !== null
  ) {
    return Object.fromEntries(
      Object.entries(valor).map(
        ([clave, item]) => [
          clave,
          repararValorUtf8(item),
        ],
      ),
    ) as T;
  }

  return valor;
}
