import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AppError } from '../../../core/models/api.model';
import { Invoice } from '../invoice.models';
import { InvoiceService } from '../invoice.service';
import { InvoiceDetailComponent } from './invoice-detail.component';

const invoice: Invoice = {
  _id: 'inv1',
  invoiceNumber: 'INV-2026-0001',
  customerId: 'c1',
  customer: { _id: 'c1', name: 'Acme', email: 'a@acme.com', balance: 0 },
  items: [{ description: 'Work', quantity: 1, unitPrice: 100, total: 100 }],
  subtotal: 100,
  tax: 10,
  totalAmount: 110,
  status: 'sent',
  isRecurring: false,
};

describe('InvoiceDetailComponent', () => {
  let component: InvoiceDetailComponent;
  let fixture: ComponentFixture<InvoiceDetailComponent>;
  let serviceSpy: jasmine.SpyObj<InvoiceService>;

  const configure = async () => {
    await TestBed.configureTestingModule({
      imports: [InvoiceDetailComponent],
      providers: [
        provideRouter([]),
        { provide: InvoiceService, useValue: serviceSpy },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'inv1' }) } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InvoiceDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  beforeEach(() => {
    serviceSpy = jasmine.createSpyObj<InvoiceService>('InvoiceService', [
      'getById',
      'downloadPdf',
      'sendEmail',
      'cancel',
    ]);
    serviceSpy.getById.and.returnValue(of(invoice));
    serviceSpy.downloadPdf.and.returnValue(of(new Blob(['%PDF'], { type: 'application/pdf' })));
    serviceSpy.sendEmail.and.returnValue(of(undefined));
    serviceSpy.cancel.and.returnValue(of(undefined));
  });

  it('loads the invoice by route id on init', async () => {
    await configure();
    expect(component).toBeTruthy();
    expect(serviceSpy.getById).toHaveBeenCalledWith('inv1');
    expect(component.invoice()).toEqual(invoice);
    expect(component.loading()).toBeFalse();
  });

  it('downloads the PDF as a file when the button handler runs', async () => {
    const createUrl = spyOn(URL, 'createObjectURL').and.returnValue('blob:fake');
    const revokeUrl = spyOn(URL, 'revokeObjectURL');
    const clickSpy = spyOn(HTMLAnchorElement.prototype, 'click');
    await configure();

    component.downloadPdf();

    expect(serviceSpy.downloadPdf).toHaveBeenCalledWith('inv1');
    expect(createUrl).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeUrl).toHaveBeenCalled();
  });

  it('sends the invoice email and shows a confirmation message', async () => {
    await configure();

    component.sendEmail();

    expect(serviceSpy.sendEmail).toHaveBeenCalledWith('inv1');
    expect(component.toastMessage()).toBe('Invoice emailed to the customer.');
    expect(component.sending()).toBeFalse();
  });

  it('cancels the invoice only after confirmation, then reloads', async () => {
    await configure();

    component.requestCancel();
    expect(component.confirmingCancel()).toBeTrue();
    expect(serviceSpy.cancel).not.toHaveBeenCalled();

    component.confirmCancel();

    expect(serviceSpy.cancel).toHaveBeenCalledWith('inv1');
    expect(component.confirmingCancel()).toBeFalse();
    expect(component.toastMessage()).toBe('Invoice cancelled.');
    // reload → getById called a second time (once on init, once after cancel)
    expect(serviceSpy.getById).toHaveBeenCalledTimes(2);
  });

  it('surfaces a user-readable error when the invoice fails to load', async () => {
    serviceSpy.getById.and.returnValue(
      throwError(() => new AppError('The requested item could not be found.', 'NOT_FOUND', 404)),
    );
    await configure();

    expect(component.error()).toBe('The requested item could not be found.');
    expect(component.invoice()).toBeNull();
  });
});
