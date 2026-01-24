# Complete OAuth Flow with Auth.js (NextAuth) — From Browser to Session

This document explains the **entire OAuth authentication flow** using **Auth.js / NextAuth (App Router)** in **strict chronological order**, exactly as it happens at runtime.

This is written to help you:

- Understand what runs **when**
- Know which **callback does what**
- See how **JWT and session are created**
- Clearly explain **login, logout, and re-login**
- Convert this into a **flowchart** if needed

---

## A. Initial State (User Not Logged In)

- Browser has **no authentication cookies**
- No JWT exists
- No session exists

```text
Browser
 └── No auth cookie
```

---

## B. User Starts Sign-In

### 1. User clicks “Sign in with Google”

```ts
await signIn("google");
```

### What happens

- Browser sends a request to:
  ```
  /api/auth/signin/google
  ```
- Auth.js responds with a **redirect to Google OAuth**
- Your app code execution stops here due to redirect

```text
Browser → Auth.js → Google OAuth
```

---

## C. Provider Authenticates User

### 2. Google authentication

- User authenticates with Google
- Google redirects the browser back to:
  ```
  /api/auth/callback/google
  ```

Control now returns to **Auth.js**.

---

## D. Auth.js Receives OAuth Callback

At this moment:

- User identity is verified by Google
- ❌ No JWT yet
- ❌ No session yet

---

## E. signIn Callback (Database Logic Only)

### 3. `callbacks.signIn` is executed

```ts
async signIn({ user, account, profile })
```

### Provided arguments

- `user`: Normalized user info (email, name, image)
- `account`: Provider data (provider name, access token, etc.)
- `profile`: Raw provider profile (Google profile)

### What happens here

- Check if user exists in DB
- Create user if missing
- Create account if missing
- Link provider to existing user

Important:

- ❌ JWT is not created here
- ❌ Session is not created here
- ✅ Database is prepared

Returning:

- `true` → Continue authentication
- `false` → Abort sign-in

---

## F. JWT Callback — Token Creation

### 4. `jwt` callback runs for the FIRST TIME

```ts
async jwt({ token, user, account })
```

### What Auth.js does internally (before your code)

Auth.js creates a base token automatically:

```ts
token = {
  sub: user.id,
  name: user.name,
  email: user.email,
  picture: user.image,
};
```

This answers the key question:

> **How is the token created when it is initially empty?**  
> Auth.js creates it internally before your `jwt` callback runs.

---

### What you do in the jwt callback

```ts
token.role = existingUser.role;
token.name = existingUser.name;
token.email = existingUser.email;
```

Final token example:

```ts
token = {
  sub: "user_123",
  name: "RP",
  email: "rp@example.com",
  role: "USER",
};
```

### Auth.js then:

- Signs the JWT
- Encrypts it
- Stores it in a secure cookie

```text
Browser ← JWT stored in cookie
```

---

## G. Session Callback — JWT to Session

### 5. `session` callback executes

```ts
async session({ session, token })
```

### Default session before customization

```ts
session = {
  user: {
    name,
    email,
    image,
  },
  expires,
};
```

### Customization in this auth logic

```ts
session.user.id = token.sub;
session.user.role = token.role;
```

### Final session object

```ts
session = {
  user: {
    id: "user_123",
    name: "RP",
    email: "rp@example.com",
    image: "...",
    role: "USER",
  },
  expires,
};
```

This is the session:

- Sent to the client
- Safe for UI usage

---

## H. User Is Logged In

Anywhere in the app:

### Server side

```ts
const session = await auth();
```

### Client side

```ts
const session = useSession();
return session?.data?.user;
```

Auth.js internally:

1. Reads cookie
2. Verifies JWT
3. Runs `jwt` callback
4. Runs `session` callback
5. Returns session

---

## I. User Logs Out

### 6. Logout action

```ts
await signOut(); // built in callback function of auth.js
```

### What happens

- Auth cookie is deleted
- Session becomes invalid

```text
Browser
 └── Auth cookie removed
```

JWT still exists cryptographically, but is unusable without the cookie.

---

## J. After Logout

```ts
const session = await auth();
```

Returns:

```ts
null;
```

User is fully logged out.

---

## K. User Signs Back In (Existing User)

### 7. User signs in again with Google

- Same OAuth redirect flow
- No new DB records created

---

## L. signIn Callback (Second Time)

- User already exists
- Account already exists
- No DB writes needed

---

## M. JWT Callback (Subsequent Requests)

```ts
async jwt({ token, user })
```

Now:

- `user` is undefined
- `token` is loaded from cookie

```ts
token = {
  sub: "user_123",
  role: "USER",
};
```

You may:

- Sync latest DB values
- Add or update token fields

---

## N. Session Callback Runs Again

- JWT is mapped to session again
- Session is returned
- User is logged in

---

## Core Rules to Remember

1. JWT is **never created manually**
2. JWT is created **before session**
3. Session is derived **from JWT**
4. `signIn` callback → database logic only
5. `jwt` callback → identity & authority
6. `session` callback → client-visible data
7. Logout deletes cookie, not the JWT itself
8. Re-login rehydrates JWT from provider flow

---

You can now read this document and use it as a **reference guide** whenever Auth.js feels confusing.
