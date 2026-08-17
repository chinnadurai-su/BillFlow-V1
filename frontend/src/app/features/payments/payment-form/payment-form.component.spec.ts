import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';

import { Paginated } from '../../../core/models/api.model';
import { Invoice } from '../../invoices/invoice.models';
import { InvoiceService } from '../../invoices/invoice.service';
import { Payment } from '../payment.models';
import { PaymentService } from '../payment.service';
import { PaymentFormComponent } from './payment-form.component';

const payable: Invoice = {
  _id: 'inv1',
  invoiceNumber: 'INV-2026-0001',
  customerId: 'c1',
  customerName: 'Acme',
  items: [],
  subtotal: 100,
  tax: 0,
  totalAmount: 100,
  amountDue: 80,
  status: 'sent',
  isRecurring: false,
};
const paid: Invoice = { ...payable, _id: 'inv2', invoiceNumber: 'INV-2026-0002', status: 'paid' };

const invoicePage: Paginated<Invoice> = {
  items: [payable, paid],
  total: 2,
  page: 1,
  limit: 100,
  totalPages: 1,
};

const recorded: Payment = {
  _id: 'p1',
  invoiceId: 'inv1',
  customerId: 'c1',
  amount: 80,
  method: 'card',
  status: 'completed',
};

describe('PaymentFormComponent', () => {
  let component: PaymentFormComponent;
  let fixture: ComponentFixture<PaymentFormComponent>;
  let paymentSpy: jasmine.SpyObj<PaymentService>;
  let invoiceSpy: jasmine.SpyObj<InvoiceService>;
  let router: Router;

  beforeEach(async () => {
    paymentSpy = jasmine.createSpyObj<PaymentService>('PaymentService', ['create']);
    paymentSpy.create.and.returnValue(of(recorded));
    invoiceSpy = jasmine.createSpyObj<InvoiceService>('InvoiceService', ['getAll']);
    invoiceSpy.getAll.and.returnValue(of(invoicePage));

    await TestBed.configureTestingModule({
      imports: [PaymentFormComponent],
      providers: [
        provideRouter([]),
        { provide: PaymentService, useValue: paymentSpy },
        { provide: InvoiceService, useValue: invoiceSpy },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({}) } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PaymentFormComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture.detectChanges();
  });

  it('creates and lists only payable invoices (excludes paid/cancelled)', () => {
    expect(component).toBeTruthy();
    expect(component.payableInvoices().map((i) => i._id)).toEqual(['inv1']);
    expect(component.form.invalid).toBeTrue();
  });

  it('pre-fills the amount with the remaining balance when an invoice is chosen', () => {
    component.form.controls.invoiceId.setValue('inv1');

    expect(component.selectedInvoice()?._id).toBe('inv1');
    expect(component.form.controls.amount.value).toBe(80);
    expect(component.remainingBalance()).toBe(80);
    expect(component.amountExceedsBalance()).toBeFalse();
  });

  it('flags an amount exceeding the remaining balance', () => {
    component.form.controls.invoiceId.setValue('inv1');
    component.form.controls.amount.setValue(200);

    expect(component.amountExceedsBalance()).toBeTrue();
  });

  it('does not record when the form is invalid', () => {
    component.submit();
    expect(paymentSpy.create).not.toHaveBeenCalled();
  });

  it('does not record when the amount exceeds the balance', () => {
    component.form.controls.invoiceId.setValue('inv1');
    component.form.controls.amount.setValue(500);

    component.submit();

    expect(paymentSpy.create).not.toHaveBeenCalled();
  });

  it('records the payment with an idempotency key and navigates on submit', () => {
    component.form.controls.invoiceId.setValue('inv1'); // prefills amount = 80
    component.form.controls.method.setValue('bank_transfer');

    component.submit();

    expect(paymentSpy.create).toHaveBeenCalledTimes(1);
    const [payloadArg, keyArg] = paymentSpy.create.calls.mostRecent().args;
    expect(payloadArg).toEqual(
      jasmine.objectContaining({ invoiceId: 'inv1', customerId: 'c1', amount: 80, method: 'bank_transfer' }),
    );
    expect(typeof keyArg).toBe('string');
    expect((keyArg as string).length).toBeGreaterThan(0);
    expect(router.navigate).toHaveBeenCalledWith(['/payments']);
  });
});
