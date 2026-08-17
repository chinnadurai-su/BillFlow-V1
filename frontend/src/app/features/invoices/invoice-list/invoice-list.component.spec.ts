import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AppError, Paginated } from '../../../core/models/api.model';
import { Invoice } from '../invoice.models';
import { InvoiceService } from '../invoice.service';
import { InvoiceListComponent } from './invoice-list.component';

const invoice: Invoice = {
  _id: 'inv1',
  invoiceNumber: 'INV-2026-0001',
  customerId: 'c1',
  customerName: 'Acme',
  items: [],
  subtotal: 100,
  tax: 10,
  totalAmount: 110,
  status: 'sent',
  isRecurring: false,
};

const pageOf = (over: Partial<Paginated<Invoice>> = {}): Paginated<Invoice> => ({
  items: [invoice],
  total: 1,
  page: 1,
  limit: 20,
  totalPages: 1,
  ...over,
});

describe('InvoiceListComponent', () => {
  let component: InvoiceListComponent;
  let fixture: ComponentFixture<InvoiceListComponent>;
  let serviceSpy: jasmine.SpyObj<InvoiceService>;

  const setup = () => {
    fixture = TestBed.createComponent(InvoiceListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  beforeEach(() => {
    serviceSpy = jasmine.createSpyObj<InvoiceService>('InvoiceService', ['getAll']);
    serviceSpy.getAll.and.returnValue(of(pageOf()));

    TestBed.configureTestingModule({
      imports: [InvoiceListComponent],
      providers: [
        provideRouter([]),
        { provide: InvoiceService, useValue: serviceSpy },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({}) } } },
      ],
    });
  });

  it('creates and loads the first page on init', () => {
    setup();
    expect(component).toBeTruthy();
    expect(serviceSpy.getAll).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      status: undefined,
      fromDate: undefined,
      toDate: undefined,
    });
    expect(component.invoices()).toEqual([invoice]);
  });

  it('maps statuses to badge classes (pure function)', () => {
    setup();
    expect(component.badgeClass('paid')).toBe('badge badge--paid');
    expect(component.badgeClass('overdue')).toBe('badge badge--overdue');
  });

  it('applies a status filter, resets to page 1 and refetches', () => {
    serviceSpy.getAll.and.returnValue(of(pageOf({ total: 40, totalPages: 2 })));
    setup();
    component.nextPage();
    serviceSpy.getAll.calls.reset();

    const event = { target: { value: 'paid' } } as unknown as Event;
    component.onStatusChange(event);

    expect(component.currentPage()).toBe(1);
    expect(component.statusFilter()).toBe('paid');
    expect(serviceSpy.getAll).toHaveBeenCalledWith(
      jasmine.objectContaining({ page: 1, status: 'paid' }),
    );
  });

  it('advances to the next page', () => {
    serviceSpy.getAll.and.returnValue(of(pageOf({ total: 40, totalPages: 2 })));
    setup();
    serviceSpy.getAll.calls.reset();

    component.nextPage();

    expect(component.currentPage()).toBe(2);
    expect(serviceSpy.getAll).toHaveBeenCalledWith(jasmine.objectContaining({ page: 2 }));
  });

  it('surfaces a user-readable error when loading fails', () => {
    serviceSpy.getAll.and.returnValue(
      throwError(() => new AppError('Connection problem — please try again.', 'NETWORK_ERROR', 0, true)),
    );
    setup();

    expect(component.error()).toBe('Connection problem — please try again.');
    expect(component.invoices()).toEqual([]);
  });
});
