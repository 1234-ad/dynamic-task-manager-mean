# Dynamic Task Manager - MEAN Stack

A comprehensive task management and collaboration platform built with MongoDB, Express.js, Angular, and Node.js.

## 🚀 Features

- **Real-time Collaboration**: Live updates using Socket.IO
- **User Authentication**: JWT-based secure authentication
- **Dynamic Dashboard**: Interactive charts and analytics
- **Task Management**: Create, assign, track, and manage tasks
- **Team Collaboration**: Comments, file attachments, notifications
- **Responsive Design**: Modern UI with Angular Material
- **RESTful API**: Well-structured backend with Express.js
- **Database**: MongoDB with Mongoose ODM

## 🛠️ Tech Stack

- **Frontend**: Angular 16+, Angular Material, Chart.js
- **Backend**: Node.js, Express.js, Socket.IO
- **Database**: MongoDB, Mongoose
- **Authentication**: JWT, bcrypt
- **Real-time**: Socket.IO
- **Styling**: Angular Material, Custom CSS

## 📦 Installation

1. Clone the repository:
```bash
git clone https://github.com/1234-ad/dynamic-task-manager-mean.git
cd dynamic-task-manager-mean
```

2. Install backend dependencies:
```bash
cd backend
npm install
```

3. Install frontend dependencies:
```bash
cd ../frontend
npm install
```

4. Set up environment variables:
```bash
# Create .env file in backend directory
cp .env.example .env
# Edit .env with your MongoDB URI and JWT secret
```

5. Start the application:
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
ng serve
```

## 🌐 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile

### Tasks
- `GET /api/tasks` - Get all tasks
- `POST /api/tasks` - Create new task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task

### Projects
- `GET /api/projects` - Get all projects
- `POST /api/projects` - Create new project
- `PUT /api/projects/:id` - Update project

## 🔧 Configuration

Create a `.env` file in the backend directory:

```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/taskmanager
JWT_SECRET=your_jwt_secret_here
NODE_ENV=development
```

## 📱 Screenshots

[Add screenshots of your application here]

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.