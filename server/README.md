# APEX Race Technologies - Backend

This is the backend server for the APEX Race Technologies website, handling form submissions and waitlist management.

## Prerequisites

- Node.js (v14 or later)
- npm (comes with Node.js)
- Gmail account (for sending emails)

## Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd server
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   - Copy `.env.example` to `.env`
   - Update the following variables in `.env`:
     ```
     EMAIL_USER=your-email@gmail.com
     EMAIL_PASS=your-app-specific-password
     ADMIN_EMAIL=admin@example.com
     PORT=3001
     ```
   
   > **Note:** For Gmail, you'll need to generate an "App Password" if you have 2FA enabled, or enable "Less secure app access" if not.

4. **Create the data directory**
   The server will automatically create the `data` directory on first run if it doesn't exist.

## Running the Server

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

The server will be available at `http://localhost:3001`

## API Endpoints

### Waitlist
- **POST** `/api/waitlist` - Add email to waitlist
  ```json
  {
    "email": "user@example.com"
  }
  ```

### Contact Form
- **POST** `/api/contact` - Submit contact form
  ```json
  {
    "name": "John Doe",
    "email": "john@example.com",
    "message": "Hello, I have a question about your products."
  }
  ```

## Data Storage

The server stores data in JSON files in the `data` directory:
- `waitlist.json` - Stores waitlist entries
- `messages.json` - Stores contact form submissions

## Security Notes

- Rate limiting is enabled (100 requests per 15 minutes per IP)
- Helmet.js is used for setting secure HTTP headers
- Input validation is performed on all endpoints
- Sensitive information is stored in environment variables

## Deployment

For production deployment, consider using:
- PM2 for process management
- Nginx as a reverse proxy
- SSL/TLS encryption (Let's Encrypt)
