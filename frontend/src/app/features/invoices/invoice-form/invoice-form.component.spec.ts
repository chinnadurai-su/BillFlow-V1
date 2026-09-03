import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';

import { Paginated } from '../../../core/models/api.model';
import { Customer } from '../../customers/customer.models';
import { CustomerService } from '../../customers/customer.service';
import { Invoice } from '../invoice.models';
import { InvoiceService } from '../invoice.service';
import { InvoiceFormComponent } from './invoice-form.component';

const customer: Customer = { _id: 'c1', name: 'Acme', email: 'a@acme.com', balance: 0 };
const customerPage: Paginated<Customer> = { items: [customer], total: 1, page: 1, limit: 100, totalPages: 1 };

// A due date safely in the future — create mode rejects past dates, so tests that need a
// valid form must not hardcode a date that will drift into the past.
function futureDate(daysAhead = 30): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// A date guaranteed to be in the past.
function pastDate(daysAgo = 30): string {
  return futureDate(-daysAgo);
}

const created: Invoice = {
  _id: 'inv1',
  invoiceNumber: 'INV-2026-0001',
  customerId: 'c1',
  items: [{ description: 'x', quantity: 2, unitPrice: 50, total: 100 }],
  subtotal: 100,
  tax: 10,
  totalAmount: 110,
  status: 'draft',
  isRecurring: false,
};

describe('InvoiceFormComponent (create mode)', () => {
  let component: InvoiceFormComponent;
  let fixture: ComponentFixture<InvoiceFormComponent>;
  let invoiceSpy: jasmine.SpyObj<InvoiceService>;
  let customerSpy: jasmine.SpyObj<CustomerService>;
  let router: Router;

  beforeEach(async () => {
    invoiceSpy = jasmine.createSpyObj<InvoiceService>('InvoiceService', ['create', 'update', 'getById']);
    invoiceSpy.create.and.returnValue(of(created));
    customerSpy = jasmine.createSpyObj<CustomerService>('CustomerService', ['getAll']);
    customerSpy.getAll.and.returnValue(of(customerPage));

    await TestBed.configureTestingModule({
      imports: [InvoiceFormComponent],
      providers: [
        provideRouter([]),
        { provide: InvoiceService, useValue: invoiceSpy },
        { provide: CustomerService, useValue: customerSpy },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({}) } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InvoiceFormComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture.detectChanges();
  });

  it('creates, loads customers, and starts invalid', () => {
    expect(component).toBeTruthy();
    expect(component.isEdit).toBeFalse();
    expect(component.customers()).toEqual([customer]);
    expect(component.form.invalid).toBeTrue();
  });

  it('computes subtotal, tax and total live from line items + rate', () => {
    component.items.at(0).setValue({ description: 'x', quantity: 2, unitPrice: 50 });
    component.form.controls.taxRate.setValue(10);

    expect(component.subtotal()).toBe(100);
    expect(component.taxAmount()).toBe(10);
    expect(component.totalAmount()).toBe(110);
    expect(component.lineTotal(0)).toBe(100);
  });

  it('adds and removes line-item rows (keeping at least one)', () => {
    expect(component.items.length).toBe(1);
    component.addItem();
    expect(component.items.length).toBe(2);
    component.removeItem(1);
    expect(component.items.length).toBe(1);
    component.removeItem(0); // guarded — cannot remove the last row
    expect(component.items.length).toBe(1);
  });

  it('requires a recurring cycle only when recurring is toggled on', () => {
    expect(component.isRecurring()).toBeFalse();
    component.form.controls.isRecurring.setValue(true);
    expect(component.isRecurring()).toBeTrue();
    expect(component.form.controls.recurringCycle.hasError('required')).toBeTrue();
  });

  it('requires a customer, a due date, and a valid line item', () => {
    expect(component.form.controls.dueDate.hasError('required')).toBeTrue();
    component.form.controls.customerId.setValue('c1');
    component.items.at(0).setValue({ description: 'x', quantity: 2, unitPrice: 50 });
    // Still invalid until a due date is provided.
    expect(component.form.invalid).toBeTrue();
    component.form.controls.dueDate.setValue(futureDate());
    expect(component.form.valid).toBeTrue();
  });

  it('rejects a due date in the past (create mode) and exposes today as the min', () => {
    component.form.controls.customerId.setValue('c1');
    component.items.at(0).setValue({ description: 'x', quantity: 2, unitPrice: 50 });

    component.form.controls.dueDate.setValue(pastDate());
    expect(component.form.controls.dueDate.hasError('pastDate')).toBeTrue();
    expect(component.form.invalid).toBeTrue();

    // Today itself is allowed (min boundary is inclusive).
    component.form.controls.dueDate.setValue(component.today);
    expect(component.form.controls.dueDate.hasError('pastDate')).toBeFalse();
    expect(component.form.valid).toBeTrue();
  });

  it('does not call create when the form is invalid', () => {
    component.submit();
    expect(invoiceSpy.create).not.toHaveBeenCalled();
  });

  it('creates with an idempotency key and navigates to the invoice on submit', () => {
    const due = futureDate();
    component.form.controls.customerId.setValue('c1');
    component.form.controls.dueDate.setValue(due);
    component.items.at(0).setValue({ description: 'x', quantity: 2, unitPrice: 50 });
    component.form.controls.taxRate.setValue(10);

    component.submit();

    expect(invoiceSpy.create).toHaveBeenCalledTimes(1);
    const [payloadArg, keyArg] = invoiceSpy.create.calls.mostRecent().args;
    expect(payloadArg.customerId).toBe('c1');
    expect(payloadArg.dueDate).toBe(due);
    expect(payloadArg.items).toEqual([{ description: 'x', quantity: 2, unitPrice: 50 }]);
    expect(payloadArg.tax).toBe(10);
    expect(payloadArg.recurringCycle).toBeNull();
    expect(typeof keyArg).toBe('string');
    expect((keyArg as string).length).toBeGreaterThan(0);
    expect(invoiceSpy.update).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/invoices', 'inv1']);
  });
});

describe('InvoiceFormComponent (edit mode)', () => {
  let component: InvoiceFormComponent;
  let fixture: ComponentFixture<InvoiceFormComponent>;
  let invoiceSpy: jasmine.SpyObj<InvoiceService>;
  let customerSpy: jasmine.SpyObj<CustomerService>;
  let router: Router;

  // Loaded invoice is already past due — editing it must not retroactively flag the date.
  const existingDue = pastDate(60);
  const existing: Invoice = {
    _id: 'inv1',
    invoiceNumber: 'INV-2026-0001',
    customerId: 'c1',
    items: [{ description: 'Consulting', quantity: 3, unitPrice: 100, total: 300 }],
    subtotal: 300,
    tax: 30,
    totalAmount: 330,
    status: 'draft',
    dueDate: `${existingDue}T00:00:00.000Z`,
    isRecurring: false,
  };

  beforeEach(async () => {
    invoiceSpy = jasmine.createSpyObj<InvoiceService>('InvoiceService', ['create', 'update', 'getById']);
    invoiceSpy.getById.and.returnValue(of(existing));
    invoiceSpy.update.and.returnValue(of(existing));
    customerSpy = jasmine.createSpyObj<CustomerService>('CustomerService', ['getAll']);
    customerSpy.getAll.and.returnValue(of(customerPage));

    await TestBed.configureTestingModule({
      imports: [InvoiceFormComponent],
      providers: [
        provideRouter([]),
        { provide: InvoiceService, useValue: invoiceSpy },
        { provide: CustomerService, useValue: customerSpy },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'inv1' }) } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InvoiceFormComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture.detectChanges();
  });

  it('loads the invoice and pre-fills the line items + back-computed tax rate', () => {
    expect(component.isEdit).toBeTrue();
    expect(invoiceSpy.getById).toHaveBeenCalledWith('inv1');
    expect(component.items.length).toBe(1);
    expect(component.items.at(0).getRawValue()).toEqual({
      description: 'Consulting',
      quantity: 3,
      unitPrice: 100,
    });
    // tax 30 on subtotal 300 → 10%
    expect(component.form.controls.taxRate.value).toBe(10);
    expect(component.form.controls.dueDate.value).toBe(existingDue);
  });

  it('keeps an already-past due date valid in edit mode (no past-date rule on edit)', () => {
    expect(component.form.controls.dueDate.value).toBe(existingDue);
    expect(component.form.controls.dueDate.hasError('pastDate')).toBeFalse();
    expect(component.form.valid).toBeTrue();
  });

  it('updates (not creates) and navigates on submit', () => {
    component.submit();

    expect(invoiceSpy.update).toHaveBeenCalledWith('inv1', jasmine.objectContaining({ customerId: 'c1' }));
    expect(invoiceSpy.create).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/invoices', 'inv1']);
  });
});
