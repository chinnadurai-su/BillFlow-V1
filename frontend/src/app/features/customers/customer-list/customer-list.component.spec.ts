import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AppError, Paginated } from '../../../core/models/api.model';
import { Customer } from '../customer.models';
import { CustomerService } from '../customer.service';
import { CustomerListComponent } from './customer-list.component';

const customer: Customer = { _id: 'c1', name: 'Acme', email: 'a@acme.com', balance: 0 };

const pageOf = (over: Partial<Paginated<Customer>> = {}): Paginated<Customer> => ({
  items: [customer],
  total: 1,
  page: 1,
  limit: 20,
  totalPages: 1,
  ...over,
});

describe('CustomerListComponent', () => {
  let component: CustomerListComponent;
  let fixture: ComponentFixture<CustomerListComponent>;
  let serviceSpy: jasmine.SpyObj<CustomerService>;

  const setup = () => {
    fixture = TestBed.createComponent(CustomerListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  beforeEach(() => {
    serviceSpy = jasmine.createSpyObj<CustomerService>('CustomerService', ['getAll', 'archive']);
    serviceSpy.getAll.and.returnValue(of(pageOf()));
    serviceSpy.archive.and.returnValue(of(undefined));

    TestBed.configureTestingModule({
      imports: [CustomerListComponent],
      providers: [
        provideRouter([]),
        { provide: CustomerService, useValue: serviceSpy },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({}) } } },
      ],
    });
  });

  it('creates and loads the first page on init', () => {
    setup();
    expect(component).toBeTruthy();
    expect(serviceSpy.getAll).toHaveBeenCalledWith({ page: 1, limit: 20, search: undefined });
    expect(component.customers()).toEqual([customer]);
    expect(component.loading()).toBeFalse();
  });

  it('advances to the next page and refetches', () => {
    serviceSpy.getAll.and.returnValue(of(pageOf({ total: 40, totalPages: 2 })));
    setup();
    expect(component.hasNextPage()).toBeTrue();

    serviceSpy.getAll.calls.reset();
    component.nextPage();

    expect(component.currentPage()).toBe(2);
    expect(serviceSpy.getAll).toHaveBeenCalledWith({ page: 2, limit: 20, search: undefined });
  });

  it('debounces search input, resets to page 1, and refetches', fakeAsync(() => {
    serviceSpy.getAll.and.returnValue(of(pageOf({ total: 40, totalPages: 2 })));
    setup();
    component.nextPage(); // move off page 1
    serviceSpy.getAll.calls.reset();

    component.search.set('acme');
    fixture.detectChanges(); // flush the toObservable effect
    tick(300); // debounce window elapses

    expect(component.currentPage()).toBe(1);
    expect(serviceSpy.getAll).toHaveBeenCalledWith({ page: 1, limit: 20, search: 'acme' });
  }));

  it('archives a customer only after dialog confirmation, then reloads', () => {
    setup();
    serviceSpy.getAll.calls.reset();

    component.requestDelete(customer);
    expect(component.pendingDelete()?._id).toBe('c1');
    expect(serviceSpy.archive).not.toHaveBeenCalled();

    component.confirmDelete(customer);
    expect(serviceSpy.archive).toHaveBeenCalledWith('c1');
    expect(serviceSpy.getAll).toHaveBeenCalled();
    expect(component.pendingDelete()).toBeNull();
  });

  it('surfaces a user-readable error when the list fails to load', () => {
    serviceSpy.getAll.and.returnValue(
      throwError(() => new AppError('Connection problem — please try again.', 'NETWORK_ERROR', 0, true)),
    );
    setup();

    expect(component.error()).toBe('Connection problem — please try again.');
    expect(component.customers()).toEqual([]);
    expect(component.loading()).toBeFalse();
  });
});
