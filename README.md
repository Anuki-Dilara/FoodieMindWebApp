# FoodieMind — MoodMeal Pantry

A cute, AI-powered food expiry tracking, inventory management, recipe recommendation, meal planner, shopping list, and budget tracking web app built for Sri Lankan kitchens.

**Tagline:** *Cook smarter, waste less, feel better.*

## Features

- Smart food inventory with unit conversion (ml/l, g/kg)
- Expiry tracking with Fresh / Use Soon / Expired badges
- Rule-based AI recipe recommendations (Spoonacular-ready)
- Mood-based meal suggestions
- Meal planner with missing ingredient alerts
- Auto shopping list when items run out
- Budget tracker in LKR (Sri Lankan Rupees)
- Analytics dashboard with Recharts
- In-app notifications
- Admin dashboard

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS, Recharts |
| Backend | Node.js, Express.js |
| Database | MongoDB, Mongoose |
| Auth | JWT + bcrypt |

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [MongoDB](https://www.mongodb.com/) running locally (or MongoDB Atlas URI)

## Quick Start

### 1. Clone and install

```bash
cd FoodieMindWebApp

# Backend
cd backend
cp .env.example .env
npm install

# Frontend (new terminal)
cd ../frontend
npm install
```

### 2. Configure environment

Edit `backend/.env`:

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/moodmeal-pantry
JWT_SECRET=your_super_secret_jwt_key_change_in_production
JWT_EXPIRES_IN=7d
SPOONACULAR_API_KEY=your_spoonacular_api_key   # optional
ADMIN_EMAIL=admin@moodmeal.com
ADMIN_PASSWORD=Admin123!
```

### 3. Seed sample data

```bash
cd backend
npm run seed
```

This creates:
- **Demo user:** `demo@moodmeal.com` / `Demo123!`
- **Admin user:** `admin@moodmeal.com` / `Admin123!`
- 10 sample recipes
- 6 sample inventory items

### 4. Start the app

```bash
# Terminal 1 — Backend
cd backend
npm run dev

# Terminal 2 — Frontend
cd frontend
npm run dev
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000/api

## Project Structure

```
FoodieMindWebApp/
├── backend/
│   ├── config/          # Database connection
│   ├── middleware/      # Auth, validation
│   ├── models/          # MongoDB schemas
│   ├── routes/          # REST API routes
│   ├── seed/            # Sample data seeder
│   ├── utils/           # Unit conversion, recipe engine, notifications
│   └── server.js
├── frontend/
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── context/     # Auth context
│   │   ├── pages/       # All app pages
│   │   └── utils/       # API client, helpers
│   └── index.html
└── README.md
```

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/register` | Register user |
| POST | `/api/auth/login` | Login |
| GET | `/api/dashboard` | Dashboard data |
| GET/POST | `/api/inventory` | Inventory CRUD |
| POST | `/api/inventory/:id/consume` | Mark food consumed |
| GET | `/api/recipes/recommendations` | AI recipe suggestions |
| POST | `/api/recipes/:id/cooked` | Cook recipe, deduct inventory |
| POST | `/api/mood/recommendations` | Mood-based meals |
| GET/POST | `/api/meal-planner` | Meal planning |
| GET/POST | `/api/shopping-list` | Shopping list |
| GET | `/api/budget/summary` | Budget overview |
| GET | `/api/analytics/summary` | Analytics data |
| GET | `/api/notifications` | Notifications |
| GET | `/api/admin/*` | Admin routes |

## Design System

| Token | Color |
|-------|-------|
| Primary (mint) | `#8DD9C4` |
| Secondary (peach) | `#FFBFA3` |
| Accent (lemon) | `#FFE082` |
| Background (cream) | `#FFF8EF` |
| Text (charcoal) | `#3A2E2A` |

## Business Rules

- **Unit conversion:** 1 L = 1000 ml, 1 kg = 1000 g
- **Consume logic:** Deducts quantity; at zero, removes item and adds to shopping list
- **Expiry:** Expired (< today), Use Soon (≤ 3 days), Fresh (> 3 days)
- **Recipes:** Sorted by ingredient match % + expiring item bonus
- **Meal planner:** Notifies 1 day before if ingredients missing

## Future AI Integration

The recipe engine uses rule-based matching in `backend/utils/recipeEngine.js`. To add Spoonacular or OpenAI:

1. Set `SPOONACULAR_API_KEY` in `.env`
2. Extend `routes/recipes.js` recommendations endpoint
3. The API structure is ready for external AI/ML services

## License

MIT — Built with love for reducing food waste.
# FoodieMindWebApp
