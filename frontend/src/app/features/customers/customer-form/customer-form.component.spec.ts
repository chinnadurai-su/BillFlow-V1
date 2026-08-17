import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';

import { Customer } from '../customer.models';
import { CustomerService } from '../customer.service';
import { CustomerFormComponent } from './customer-form.component';

const created: Customer = { _id: 'c1', name: 'Acme', email: 'billing@acme.com', balance: 0 };

describe('CustomerFormComponent (create mode)', () => {
  let component: CustomerFormComponent;
  let fixture: ComponentFixture<CustomerFormComponent>;
  let serviceSpy: jasmine.SpyObj<CustomerService>;
  let router: Router;

  beforeEach(async () => {
    serviceSpy = jasmine.createSpyObj<CustomerService>('CustomerService', ['getById', 'create', 'update']);
    serviceSpy.create.and.returnValue(of(created));

    await TestBed.configureTestingModule({
      imports: [CustomerFormComponent],
      providers: [
        provideRouter([]),
        { provide: CustomerService, useValue: serviceSpy },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({}) } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CustomerFormComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture.detectChanges();
  });

  it('creates and is in create mode without fetching', () => {
    expect(component).toBeTruthy();
    expect(component.isEdit).toBeFalse();
    expect(serviceSpy.getById).not.toHaveBeenCalled();
  });

  it('starts invalid with required fields empty', () => {
    expect(component.form.invalid).toBeTrue();
  });

  it('rejects invalid input and does not call create', () => {
    component.form.patchValue({ name: '', email: 'not-an-email' });
    component.submit();

    expect(serviceSpy.create).not.toHaveBeenCalled();
    expect(component.form.controls.email.invalid).toBeTrue();
  });

  it('creates the customer and navigates back to the list on submit', () => {
    component.form.patchValue({
      name: 'Acme',
      email: 'billing@acme.com',
      phone: '555',
      billingAddress: { line1: '1 St', city: 'NYC', state: 'NY', zip: '10001', country: 'US' },
    });

    component.submit();

    expect(serviceSpy.create).toHaveBeenCalledWith(
      jasmine.objectContaining({
        name: 'Acme',
        email: 'billing@acme.com',
        phone: '555',
        billingAddress: jasmine.objectContaining({ city: 'NYC' }),
      }),
    );
    expect(serviceSpy.update).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/customers']);
    expect(component.saving()).toBeFalse();
  });
});

describe('CustomerFormComponent (edit mode)', () => {
  let component: CustomerFormComponent;
  let fixture: ComponentFixture<CustomerFormComponent>;
  let serviceSpy: jasmine.SpyObj<CustomerService>;
  let router: Router;

  const existing: Customer = {
    _id: 'c1',
    name: 'Acme',
    email: 'billing@acme.com',
    phone: '555',
    balance: 0,
    billingAddress: { line1: '1 St', city: 'NYC', state: 'NY', zip: '10001', country: 'US' },
  };

  beforeEach(async () => {
    serviceSpy = jasmine.createSpyObj<CustomerService>('CustomerService', ['getById', 'create', 'update']);
    serviceSpy.getById.and.returnValue(of(existing));
    serviceSpy.update.and.returnValue(of(existing));

    await TestBed.configureTestingModule({
      imports: [CustomerFormComponent],
      providers: [
        provideRouter([]),
        { provide: CustomerService, useValue: serviceSpy },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'c1' }) } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CustomerFormComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture.detectChanges();
  });

  it('is in edit mode and pre-fills the form from getById', () => {
    expect(component.isEdit).toBeTrue();
    expect(serviceSpy.getById).toHaveBeenCalledWith('c1');
    expect(component.form.controls.name.value).toBe('Acme');
    expect(component.form.controls.billingAddress.controls.city.value).toBe('NYC');
  });

  it('updates the customer (not create) and navigates on submit', () => {
    component.submit();

    expect(serviceSpy.update).toHaveBeenCalledWith(
      'c1',
      jasmine.objectContaining({ name: 'Acme', email: 'billing@acme.com' }),
    );
    expect(serviceSpy.create).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/customers']);
  });
});
