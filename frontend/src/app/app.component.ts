import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth.service';
import { SocketService } from './services/socket.service';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>'
})
export class AppComponent implements OnInit {
  // Injecting ThemeService here (even though unused directly) runs its constructor
  // immediately, applying the saved/system theme before the first paint.
  constructor(private auth: AuthService, private socket: SocketService, private theme: ThemeService) {}

  ngOnInit() {
    if (this.auth.isLoggedIn()) this.socket.connect();
  }
}
