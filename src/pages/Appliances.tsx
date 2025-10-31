import React, { useState, useEffect } from "react";
import {
  AppSidebar,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/Sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import AppliancesTab from "@/components/tabs/AppliancesTab";
import EditApplianceModal from "@/components/EditApplianceModal";
import { Navigation, PlugZap } from "lucide-react";
import { Navigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAppliances, Appliance } from "@/hooks/useAppliances";

const Appliances = () => {
  const { appliances, addAppliance, updateAppliance, deleteAppliance } =
    useAppliances();
  const [editingAppliance, setEditingAppliance] = useState<Appliance | null>(
    null
  );
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  function handleAddAppliance(appliance: Appliance): void {
    addAppliance(appliance);
  }

  const openEditModal = (appliance: Appliance) => {
    setEditingAppliance(appliance);
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditingAppliance(null);
    setIsEditModalOpen(false);
  };

  const handleSaveEditedAppliance = (updatedAppliance: Appliance) => {
    updateAppliance(updatedAppliance);
  };

  const [deleteApplianceModal, setDeleteApplianceModal] =
    useState<Appliance | null>(null);

  const openDeleteModal = (appliance: Appliance) => {
    setDeleteApplianceModal(appliance);
  };

  const closeDeleteModal = () => {
    setDeleteApplianceModal(null);
  };

  const handleDeleteConfirm = () => {
    if (deleteApplianceModal) {
      deleteAppliance(deleteApplianceModal.id);
      closeDeleteModal();
    }
  };

  const navigateToCalculator = () => {
    window.location.href = "/calculadora";
  };

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-energy-green-light rounded flex items-center justify-center">
              <PlugZap className="w-5 h-5 text-energy-green-light absolute " />
            </div>
            <span className="font-semibold">Aparelhos</span>
          </div>
        </header>
        <div className="flex flex-col min-h-screen bg-background dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
          <main className="flex-grow container mx-auto px-4 pt-6 pb-10">
            <AppliancesTab
              appliances={appliances}
              onEdit={openEditModal}
              onDelete={openDeleteModal}
              onAddAppliance={handleAddAppliance}
              onNavigateToCalculator={navigateToCalculator}
            />
          </main>
        </div>
      </SidebarInset>
      <EditApplianceModal
        appliance={editingAppliance}
        isOpen={isEditModalOpen}
        onClose={closeEditModal}
        onSave={handleSaveEditedAppliance}
      />
      <AlertDialog
        open={!!deleteApplianceModal}
        onOpenChange={(open) => !open && closeDeleteModal()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o aparelho{" "}
              <strong>{deleteApplianceModal?.name}</strong>? Esta ação é
              permanente e não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeDeleteModal}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
};

export default Appliances;
