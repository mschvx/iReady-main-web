import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { FirstPage } from "@/pages/FirstPage";
import { LogInOverlay } from "@/pages/LogInOverlay";
import { SignUpOverlay } from "@/pages/SignUpOverlay";
import { Home } from "@/pages/Home";
import { Account } from "@/pages/Account";
import { PublicAccount } from "@/pages/PublicAccount";

function Router() {
  return (
    <Switch>
      <Route path="/">
        <FirstPage />
      </Route>

      <Route path="/login">
        <LogInOverlay />
      </Route>

      <Route path="/signup">
        <SignUpOverlay />
      </Route>

      <Route path="/home">
        <Home />
      </Route>

      <Route path="/account">
        <Account />
      </Route>

      <Route path="/u/:username">
        <PublicAccount />
      </Route>

      {/* Fallback to 404 */}
      <Route>
        <NotFound />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
