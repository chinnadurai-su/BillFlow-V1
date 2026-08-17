import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AppError, Paginated } from '../../../core/models/api.model';
import { Payment } from '../payment.models';
import { PaymentService } from '../payment.service';
import { PaymentListComponent } from './payment-list.component';

const payment: Payment = {
  _id: 'p1',
  invoiceId: 'inv1',
  invoiceNumber: 'INV-2026-0001',
  customerId: 'c1',
  customerName: 'Acme',
  amount: 50,
  method: 'card',
  status: 'completed',
};

const pageOf = (over: Partial<Paginated<Payment>> = {}): Paginated<Payment> => ({
  items: [payment],
  total: 1,
  page: 1,
  limit: 20,
  totalPages: 1,
  ...over,
});

describe('PaymentListComponent', () => {
  let component: PaymentListComponent;
  let fixture: ComponentFixture<PaymentListComponent>;
  let serviceSpy: jasmine.SpyObj<PaymentService>;

  const setup = () => {
    fixture = TestBed.createComponent(PaymentListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  beforeEach(() => {
    serviceSpy = jasmine.createSpyObj<PaymentService>('PaymentService', ['getAll']);
    serviceSpy.getAll.and.returnValue(of(pageOf()));

    TestBed.configureTestingModule({
      imports: [PaymentListComponent],
      providers: [
        provideRouter([]),
        { provide: PaymentService, useValue: serviceSpy },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({}) } } },
      ],
    });
  });

  it('creates and loads the first page on init', () => {
    setup();
    expect(component).toBeTruthy();
    expect(serviceSpy.getAll).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(component.payments()).toEqual([payment]);
  });

  it('maps payment statuses to badge classes (pure function)', () => {
    setup();
    expect(component.badgeClass('completed')).toBe('badge badge--completed');
    expect(component.badgeClass('pending')).toBe('badge badge--pending');
    expect(component.badgeClass('failed')).toBe('badge badge--failed');
  });

  it('advances to the next page', () => {
    serviceSpy.getAll.and.returnValue(of(pageOf({ total: 40, totalPages: 2 })));
    setup();
    serviceSpy.getAll.calls.reset();

    component.nextPage();

    expect(component.currentPage()).toBe(2);
    expect(serviceSpy.getAll).toHaveBeenCalledWith({ page: 2, limit: 20 });
  });

  it('surfaces a user-readable error when loading fails', () => {
    serviceSpy.getAll.and.returnValue(
      throwError(() => new AppError('Connection problem — please try again.', 'NETWORK_ERROR', 0, true)),
    );
    setup();

    expect(component.error()).toBe('Connection problem — please try again.');
    expect(component.payments()).toEqual([]);
  });
});
