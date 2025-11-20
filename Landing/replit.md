# IREADY - Disaster Preparedness Platform

## Overview

IREADY is a web application focused on disaster preparedness for the Philippines. The platform features an interactive map visualization and aims to provide users with information and tools for disaster readiness. Built as a full-stack TypeScript application with React on the frontend and Express on the backend, it uses a modern development stack optimized for rapid iteration.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System**
- React 18+ with TypeScript for type-safe component development
- Vite as the build tool and development server for fast hot module replacement
- Wouter for lightweight client-side routing instead of React Router

**UI Component Library**
- shadcn/ui component system built on Radix UI primitives
- Tailwind CSS for utility-first styling with custom design tokens
- New York style variant configured for shadcn components
- Comprehensive component library including forms, dialogs, toasts, and data visualization components

**State Management & Data Fetching**
- TanStack Query (React Query) for server state management and caching
- Custom API client wrapper with automatic error handling and credential management
- Query client configured with infinite stale time and disabled auto-refetching for optimized data usage

**Map Visualization**
- Leaflet library for interactive Philippines map rendering
- React-Leaflet for React component integration
- OpenStreetMap tile layer for map data
- Custom PhilippinesMap component centered on Manila coordinates

**Styling System**
- CSS custom properties for theming (dark mode support configured)
- Class Variance Authority (CVA) for component variant management
- Tailwind configuration with extended color palette and custom animations
- Responsive breakpoints with mobile-first design approach

### Backend Architecture

**Server Framework**
- Express.js as the HTTP server framework
- TypeScript with ESM module system for modern JavaScript features
- Custom middleware for request/response logging with timing metrics

**Development Setup**
- Vite middleware integration for development with HMR
- Separate build process using esbuild for production server bundling
- Custom error handling middleware for consistent API error responses

**Storage Layer**
- Abstract IStorage interface defining CRUD operations
- In-memory storage implementation (MemStorage) for development
- Ready for migration to persistent database (Drizzle ORM configured)
- User entity with username/password fields as starting schema

**API Structure**
- RESTful API routes prefixed with `/api`
- Centralized route registration in `registerRoutes` function
- Storage abstraction allows easy swapping between memory and database implementations

### Database Schema

**ORM & Migrations**
- Drizzle ORM configured for PostgreSQL dialect
- Drizzle Kit for schema migrations with output to `/migrations` directory
- Schema defined in shared directory for use across client and server

**Current Schema**
- Users table with UUID primary keys (generated via `gen_random_uuid()`)
- Username and password fields with unique constraint on username
- Zod schemas generated from Drizzle schema for runtime validation
- Type inference for insert and select operations

**Database Configuration**
- Neon Database serverless driver for PostgreSQL connections
- Connection string expected via `DATABASE_URL` environment variable
- Schema located at `shared/schema.ts` for shared type definitions

### External Dependencies

**Database**
- PostgreSQL via Neon serverless driver (`@neondatabase/serverless`)
- Drizzle ORM for type-safe database queries and schema management
- Connection pooling handled by Neon driver

**UI Libraries**
- Radix UI component primitives (20+ component packages)
- Leaflet for map rendering
- date-fns for date formatting and manipulation
- Lucide React for iconography

**Development Tools**
- Replit-specific plugins for development (cartographer, dev banner, runtime error overlay)
- TypeScript compiler for type checking
- PostCSS with Tailwind and Autoprefixer

**Form Handling**
- React Hook Form for form state management
- Hookform Resolvers for validation integration
- Zod for schema validation (integrated with Drizzle)

**Session Management**
- connect-pg-simple package installed (indicates planned PostgreSQL session store)
- Cookie-based sessions expected once authentication is implemented

**Build & Bundling**
- Vite for frontend bundling and development
- esbuild for backend production builds
- Path aliases configured for clean imports (@/, @shared/, @assets/)