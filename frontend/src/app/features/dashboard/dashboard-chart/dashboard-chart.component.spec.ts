import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RevenueTrendPoint } from '../dashboard.models';
import { DashboardChartComponent } from './dashboard-chart.component';

const trend: RevenueTrendPoint[] = [
  { label: 'Jan', revenue: 100 },
  { label: 'Feb', revenue: 200 },
];

describe('DashboardChartComponent', () => {
  let component: DashboardChartComponent;
  let fixture: ComponentFixture<DashboardChartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardChartComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardChartComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates with an empty dataset by default', () => {
    expect(component).toBeTruthy();
    expect(component.data()).toEqual([]);
    expect(fixture.nativeElement.querySelector('canvas')).toBeTruthy();
  });

  it('renders (rebuilds) the chart when data is provided', () => {
    fixture.componentRef.setInput('data', trend);
    fixture.detectChanges();

    expect(component.data()).toEqual(trend);
    // The canvas is still present and no error was thrown building the chart.
    expect(fixture.nativeElement.querySelector('canvas')).toBeTruthy();
  });
});
