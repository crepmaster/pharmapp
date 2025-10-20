# Claude Code Consultation Prompt

## Context
I'm building a magazine app (iOS/Android) that connects to WordPress via GraphQL. My current Expo setup has critical version incompatibilities causing `import.meta` syntax errors.

## Current Issues
- Expo Router 6.0.7 + SDK 54 + React 19 = import.meta syntax errors
- Complex Metro configuration conflicts
- Version cascade problems preventing web builds

## Project Requirements
- WordPress GraphQL API integration
- Subscription system (free + premium content)
- Cross-platform (iOS + Android)
- Modern UI with latest tech
- High performance for content-heavy app

## Options Analyzed
1. **Fixed Expo (stable)**: Downgrade to SDK 50, expo-router 3.5.23, React 18.2.0
2. **Latest Expo (modern)**: SDK 52, expo-router 4.x, React 18.3.1, replace problematic plugins
3. **React Native CLI**: Full control, React 19, RN 0.76, manual configuration
4. **Flutter**: Dart/Flutter, excellent performance, different ecosystem

## Question for Claude Code
**Which option should I choose to restart this project from scratch? Please provide:**
1. Specific technology choice with exact versions
2. Rationale based on magazine app requirements
3. Implementation strategy for WordPress GraphQL integration
4. Any potential pitfalls to avoid

**Priority:** Long-term maintainability + WordPress integration + subscription system ease
