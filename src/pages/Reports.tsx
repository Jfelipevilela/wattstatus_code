import React, { useState, useEffect } from "react";
import {
  AppSidebar,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/Sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import ReportsTab from "@/components/tabs/ReportsTab";
import { FileText } from "lucide-react";
import { useAppliances } from "@/hooks/useAppliances";
import { DataState } from "@/components/DataState";

const Reports = () => {
  const { appliances, loading, error, refetch } = useAppliances();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
          <SidebarTrigger />
          <FileText className="h-5 w-5 text-energy-green-light" aria-hidden="true" />
          <span className="font-semibold">Relatórios</span>
        </header>
        <div className="flex min-h-screen flex-col bg-background">
          <main className="container mx-auto min-w-0 max-w-7xl flex-grow px-4 py-6 sm:py-8">
            {loading || error ? <DataState loading={loading} error={error} onRetry={refetch} /> : <ReportsTab appliances={appliances} />}
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default Reports;
