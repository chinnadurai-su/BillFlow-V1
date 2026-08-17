// app.component.ts — Standalone root component; hosts the router outlet for the SPA shell.
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  // TODO: add the app shell (nav, layout) once feature routes exist.
}
