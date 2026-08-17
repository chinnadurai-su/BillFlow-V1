import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConfirmDialogComponent } from './confirm-dialog.component';

describe('ConfirmDialogComponent', () => {
  let component: ConfirmDialogComponent;
  let fixture: ComponentFixture<ConfirmDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfirmDialogComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfirmDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates and renders the message + labels', () => {
    fixture.componentRef.setInput('message', 'Archive Acme?');
    fixture.componentRef.setInput('confirmLabel', 'Archive');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Archive Acme?');
    expect(text).toContain('Archive');
  });

  it('emits confirm when the confirm button is clicked', () => {
    let confirmed = false;
    component.confirm.subscribe(() => (confirmed = true));

    fixture.nativeElement.querySelector('.btn--danger').click();

    expect(confirmed).toBeTrue();
  });

  it('emits cancel when the cancel button is clicked', () => {
    let cancelled = false;
    component.cancel.subscribe(() => (cancelled = true));

    fixture.nativeElement.querySelector('.btn--ghost').click();

    expect(cancelled).toBeTrue();
  });
});
