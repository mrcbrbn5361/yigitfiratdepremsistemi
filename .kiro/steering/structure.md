# Project Structure

## Workspace Organization

```
.kiro/
├── steering/           # AI assistant guidance rules
│   ├── product.md     # Product overview and principles
│   ├── tech.md        # Technology stack and commands
│   ├── structure.md   # Project organization (this file)
│   └── ultrathink.md  # Advanced engineering protocols
└── settings/          # Kiro configuration
    └── mcp.json       # Model Context Protocol settings
```

## Standard Project Layout

When creating new projects, follow these conventions:

### Frontend Projects
```
src/
├── components/        # Reusable UI components
├── pages/            # Route components
├── hooks/            # Custom React hooks
├── utils/            # Helper functions
├── types/            # TypeScript definitions
└── assets/           # Static resources
```

### Backend Projects
```
src/
├── routes/           # API endpoints
├── middleware/       # Express/framework middleware
├── models/           # Data models
├── services/         # Business logic
├── utils/            # Helper functions
└── types/            # Type definitions
```

### Full-Stack Projects
```
client/               # Frontend application
server/               # Backend application
shared/               # Shared types and utilities
docs/                 # Documentation
scripts/              # Build and deployment scripts
```

## File Naming Conventions

- Use kebab-case for files and directories
- Use PascalCase for React components
- Use camelCase for JavaScript/TypeScript functions
- Use UPPER_CASE for constants and environment variables

## Architecture Patterns

- **Separation of Concerns**: Clear boundaries between layers
- **Dependency Injection**: Avoid tight coupling
- **Error Boundaries**: Graceful failure handling
- **Type Safety**: Leverage static typing where available
- **Single Responsibility**: Each module has one clear purpose