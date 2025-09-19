import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';

export interface User {
  _id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  avatar?: string;
  role: string;
  department?: string;
  preferences?: {
    theme: string;
    notifications: {
      email: boolean;
      push: boolean;
      taskUpdates: boolean;
      projectUpdates: boolean;
    };
  };
}

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = `${environment.apiUrl}/auth`;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);

  public currentUser$ = this.currentUserSubject.asObservable();
  public isAuthenticated$ = this.isAuthenticatedSubject.asObservable();

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    this.initializeAuth();
  }

  private initializeAuth(): void {
    const token = this.getToken();
    if (token) {
      this.verifyToken().subscribe({
        next: (response) => {
          this.setCurrentUser(response.user);
        },
        error: () => {
          this.logout();
        }
      });
    }
  }

  register(userData: {
    username: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    department?: string;
  }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, userData)
      .pipe(
        tap(response => {
          this.setAuthData(response.token, response.user);
        })
      );
  }

  login(credentials: { login: string; password: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, credentials)
      .pipe(
        tap(response => {
          this.setAuthData(response.token, response.user);
        })
      );
  }

  logout(): void {
    localStorage.removeItem('token');
    this.currentUserSubject.next(null);
    this.isAuthenticatedSubject.next(false);
    this.router.navigate(['/login']);
  }

  getProfile(): Observable<{ user: User }> {
    return this.http.get<{ user: User }>(`${this.apiUrl}/profile`);
  }

  updateProfile(profileData: Partial<User>): Observable<{ message: string; user: User }> {
    return this.http.put<{ message: string; user: User }>(`${this.apiUrl}/profile`, profileData)
      .pipe(
        tap(response => {
          this.setCurrentUser(response.user);
        })
      );
  }

  changePassword(passwordData: {
    currentPassword: string;
    newPassword: string;
  }): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/change-password`, passwordData);
  }

  verifyToken(): Observable<{ valid: boolean; user: User }> {
    return this.http.post<{ valid: boolean; user: User }>(`${this.apiUrl}/verify-token`, {});
  }

  private setAuthData(token: string, user: User): void {
    localStorage.setItem('token', token);
    this.setCurrentUser(user);
  }

  private setCurrentUser(user: User): void {
    this.currentUserSubject.next(user);
    this.isAuthenticatedSubject.next(true);
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  isAuthenticated(): boolean {
    return this.isAuthenticatedSubject.value;
  }

  hasRole(role: string): boolean {
    const user = this.getCurrentUser();
    return user ? user.role === role : false;
  }

  hasAnyRole(roles: string[]): boolean {
    const user = this.getCurrentUser();
    return user ? roles.includes(user.role) : false;
  }
}