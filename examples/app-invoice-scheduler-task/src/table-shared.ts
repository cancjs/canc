/** One invoice row's rendered fields. issuedAt is optional until the mock domain supplies it. */
export interface IInvoiceRow {
  id: string;
  customer: string;
  total: number;
  paid: boolean;
  issuedAt?: string;
}

const currencyFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

const templateRow = document.createElement('tr');
for (const field of ['id', 'customer', 'total', 'paid', 'issued']) {
  const cell = document.createElement('td');
  cell.className = field;
  templateRow.append(cell);
}

/** Clones the row template and fills it with one invoice's formatted values. */
export function createRow(invoice: IInvoiceRow): HTMLTableRowElement {
  const row = templateRow.cloneNode(true) as HTMLTableRowElement;
  const cells = row.cells;
  cells[0].textContent = invoice.id;
  cells[1].textContent = invoice.customer;
  cells[2].textContent = currencyFormat.format(invoice.total);
  cells[3].textContent = invoice.paid ? 'Paid' : 'Unpaid';
  cells[4].textContent = invoice.issuedAt ? dateFormat.format(new Date(invoice.issuedAt)) : '';
  return row;
}

/** Builds one DocumentFragment for the whole chunk and appends it to the tbody once. */
export function appendChunk(tbody: HTMLTableSectionElement, invoices: readonly IInvoiceRow[]): void {
  const fragment = document.createDocumentFragment();
  for (const invoice of invoices) {
    fragment.appendChild(createRow(invoice));
  }
  tbody.appendChild(fragment);
}
