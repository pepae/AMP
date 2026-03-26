import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import BrowsePage from "./pages/BrowsePage";
import ListingDetailPage from "./pages/ListingDetailPage";
import CreateListingPage from "./pages/CreateListingPage";
import MyListingsPage from "./pages/MyListingsPage";
import MyOrdersPage from "./pages/MyOrdersPage";
import HomePage from "./pages/HomePage";
import ProtocolPage from "./pages/ProtocolPage";
import AgentSetupPage from "./pages/AgentSetupPage";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/protocol" element={<ProtocolPage />} />
        <Route path="/agent-setup" element={<AgentSetupPage />} />
        <Route path="/browse" element={<BrowsePage />} />
        <Route path="/listing/:id" element={<ListingDetailPage />} />
        <Route path="/create" element={<CreateListingPage />} />
        <Route path="/my/listings" element={<MyListingsPage />} />
        <Route path="/my/orders" element={<MyOrdersPage />} />
      </Routes>
    </Layout>
  );
}
