import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import Admin from "./pages/admin";
import Assessment from "./pages/assessment";
import NotFound from "./pages/not-found";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Switch>
        <Route path="/admin" component={Admin} />
        <Route path="/assessment/:publicUrl" component={Assessment} />
        <Route path="/" component={Admin} />
        <Route component={NotFound} />
      </Switch>
    </QueryClientProvider>
  );
}

export default App;

