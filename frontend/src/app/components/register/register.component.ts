import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SocketService } from '../../services/socket.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.component.html'
})
export class RegisterComponent {
  name = '';
  email = '';
  password = '';
  error = '';

  constructor(private auth: AuthService, private router: Router, private socket: SocketService) {}

  onSubmit() {
    this.error = '';
    this.auth.register(this.name, this.email, this.password).subscribe({
      next: () => { this.socket.connect(); this.router.navigate(['/notes']); },
      error: (err) => this.error = err.error?.message || 'Registration failed'
    });
  }
}
