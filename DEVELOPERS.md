# Developer Guide: Building New Pages

Welcome to the NITPY Hostel System development guide. This document outlines the standardized workflow for creating new pages using the system's design language and protected routing.

## 🧱 Using the `BasePage` Component

The `BasePage` component is the foundation of the site's aesthetics. It automatically manages:

- **Theme Support**: Seamless transitions between Light and Dark modes.
- **Background**: The signature animated gradient and surface styling.
- **Navigation**: The global top bar with user profile and theme toggle.
- **Layout**: Consistent padding, responsive max-width, and header offsets.
- **Safety**: Automated loading states and role-based access control.

### Basic Usage

```tsx
import { BasePage } from "@/components/BasePage";

export default function MyPage() {
  return (
    <BasePage
      title="My Page Title"
      subtitle="Institutional Metadata Style Subtitle"
    >
      <div className="p-8 bg-surface/40 backdrop-blur-xl border border-primary/5 rounded-3xl">
        {/* Your content here */}
      </div>
    </BasePage>
  );
}
```

## 🛡️ Protected Routes

`BasePage` includes built-in protection props. If a user is not logged in or lacks the required role, they will be **silently redirected** back to the dashboard (`/`).

| Prop               | Description                                     |
| :----------------- | :---------------------------------------------- |
| `requireAdmin`     | Restricts access to System Administrators.      |
| `requireFaculty`   | Restricts access to Faculty members.            |
| `requireCaretaker` | Restricts access to Hostel Caretakers.          |
| `requireKiosk`     | Restricts access to the Biometric Kiosk device. |

**Example:**

```tsx
<BasePage title="Admin Panel" requireAdmin={true}>
  {/* Only admins can see this */}
</BasePage>
```

## 🏠 Linking to the Homepage

To add a new card to the main dashboard (`src/app/page.tsx`), use the `ActionCard` component. You must verify the user's role before rendering the card to prevent UI clutter.

### Best Practice:

```tsx
{isAdmin && (
  <ActionCard
    title="New Feature"
    subtitle="Feature Description"
    icon={<Code size={32} className="text-secondary" />}
    delay={0.4}
    onClick={() => {
      startLoading(); // Always trigger global loader
      router.push("/new-feature");
    }}
  />
)}
```

> [!IMPORTANT]
> Do **not** use semicolons `;` inside JSX curly braces `{}`. They will cause a syntax error in React.

## 🔐 Authentication API (`useAuth`)

The `useAuth` hook is the primary way to access user state and permissions.

```tsx
import { useAuth } from "@/context/AuthContext";

const { 
  user,           // Basic Appwrite account details
  isAdmin,        // Boolean: System Administrator
  isFaculty,      // Boolean: Faculty member
  isCaretaker,    // Boolean: Hostel caretaker
  isKiosk,        // Boolean: Kiosk device
  studentData,    // Detailed student profile (Roll No, Course, etc.)
  logout          // Function to sign out
} = useAuth();
```

## 🛡️ Audit Logging (`logTransaction`)

All sensitive actions must be logged to the `audit_logs` collection. The system handles offline queuing automatically—if the user is offline, the log is saved locally and synced when they return online.

```tsx
import { logTransaction } from "@/lib/auditLogger";

await logTransaction({
  action: "FEATURE_ACCESS",
  message: `User ${user.name} accessed the new feature.`,
  level: "low",             // "high" | "medium" | "low"
  metadata: { key: "value" } // Optional extra data
});
```

## ⏳ Global Loading Bar (`useLoading`)

The site uses a premium top-loading bar. You should trigger it whenever a navigation or heavy async action starts.

```tsx
import { useLoading } from "@/context/LoadingContext";

const { startLoading, stopLoading } = useLoading();

// Example:
const handleClick = async () => {
  startLoading();
  await performTask();
  stopLoading();
};
```

## 🔍 Reference Implementation

For a complete example of the site's design patterns (grid layouts, glassmorphism, animations), refer to:

- **`src/components/Demo.tsx`**: A standalone reference component containing all UI patterns.
- **`src/app/audit-logs/page.tsx`**: A high-density data page implementation.

## 🎨 Theme Management

The system uses CSS variables for colors (e.g., `var(--background)`, `var(--primary)`). `BasePage` handles the background and navigation injection, so you only need to ensure your custom components use the utility classes like `text-primary` or `bg-surface`.

---

_Created by Rameez Mohammad for NITPY._
