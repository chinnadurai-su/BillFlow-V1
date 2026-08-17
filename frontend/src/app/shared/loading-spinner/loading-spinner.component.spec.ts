import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LoadingSpinnerComponent } from './loading-spinner.component';

describe('LoadingSpinnerComponent', () => {
  let component: LoadingSpinnerComponent;
  let fixture: ComponentFixture<LoadingSpinnerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoadingSpinnerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(LoadingSpinnerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates with a default caption', () => {
    expect(component).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Loading…');
  });

  it('shows a custom message when provided', () => {
    fixture.componentRef.setInput('message', 'Fetching invoices…');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Fetching invoices…');
  });
});
