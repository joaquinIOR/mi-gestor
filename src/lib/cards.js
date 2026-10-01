// Tarjetas habituales en Chile (bancos, retail y billeteras digitales). Solo se guarda el nombre que elijas,
// nunca el número de la tarjeta. Si la tuya no está, puedes escribir otra.
export const CARD_GROUPS = [
  {
    kind: 'credito',
    label: 'Crédito',
    cards: [
      'CMR Falabella',
      'Tarjeta Ripley',
      'Tarjeta Cencosud Scotiabank',
      'Tarjeta Líder BCI',
      'Tarjeta La Polar',
      'Tarjeta Hites',
      'Banco de Chile (Visa / Mastercard)',
      'BancoEstado (crédito)',
      'Santander (crédito)',
      'BCI (crédito)',
      'Itaú (crédito)',
      'Scotiabank (crédito)',
      'Banco Security (crédito)',
      'Banco BICE (crédito)',
      'Banco Consorcio (crédito)',
      'Banco Internacional (crédito)',
      'Coopeuch (crédito)',
    ],
  },
  {
    kind: 'debito',
    label: 'Débito',
    cards: [
      'CuentaRUT BancoEstado',
      'Banco de Chile (débito)',
      'Santander (débito)',
      'BCI (débito)',
      'MACH',
      'Itaú (débito)',
      'Scotiabank (débito)',
      'Banco Falabella (débito)',
      'Coopeuch (débito)',
    ],
  },
  {
    kind: 'prepago',
    label: 'Prepago',
    cards: ['Mercado Pago', 'Tenpo', 'Prepago La Polar'],
  },
];

export const ALL_CARDS = CARD_GROUPS.flatMap((g) => g.cards);
export const OTHER_CARD = '__other';
