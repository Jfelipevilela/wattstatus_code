import { useState } from "react";
import {
  AppSidebar,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/Sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import AppliancesTab from "@/components/tabs/AppliancesTab";
import EditApplianceModal from "@/components/EditApplianceModal";
import { PlugZap } from "lucide-react";
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
import { toast } from "@/components/ui/use-toast";
import {
  useAppliances,
  Appliance,
  ApplianceInput,
} from "@/hooks/useAppliances";
import { notifyError } from "@/lib/error-toast";
import { DataState } from "@/components/DataState";
import { useSearchParams } from "react-router-dom";

const Appliances = () => {
  const {
    appliances,
    loading,
    error,
    refetch,
    addAppliance,
    updateAppliance,
    deleteAppliance,
  } = useAppliances();
  const [searchParams] = useSearchParams();
  const [deleting, setDeleting] = useState(false);
  const [editingAppliance, setEditingAppliance] = useState<Appliance | null>(
    null,
  );
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  async function handleAddAppliance(appliance: ApplianceInput): Promise<void> {
    await addAppliance(appliance);
  }

  const openEditModal = (appliance: Appliance) => {
    setEditingAppliance(appliance);
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditingAppliance(null);
    setIsEditModalOpen(false);
  };

  const handleSaveEditedAppliance = async (
    id: string,
    updates: Partial<ApplianceInput>,
  ) => {
    await updateAppliance(id, updates);
  };

  const [deleteApplianceModal, setDeleteApplianceModal] =
    useState<Appliance | null>(null);

  const openDeleteModal = (appliance: Appliance) => {
    setDeleteApplianceModal(appliance);
  };

  const closeDeleteModal = () => {
    setDeleteApplianceModal(null);
  };

  const handleDeleteConfirm = async () => {
    if (deleteApplianceModal && !deleting) {
      setDeleting(true);
      try {
        const applianceName = deleteApplianceModal.name;
        await deleteAppliance(deleteApplianceModal.id);
        toast({
          title: "Aparelho excluído com sucesso!",
          description: `${applianceName} foi removido da sua lista.`,
        });
        closeDeleteModal();
      } catch (err) {
        notifyError(err, {
          title: "Erro ao excluir aparelho",
          fallbackMessage: "Não foi possível excluir o aparelho.",
        });
      } finally {
        setDeleting(false);
      }
    }
  };

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
          <SidebarTrigger />
          <PlugZap className="h-5 w-5 text-energy-green-light" aria-hidden="true" />
          <span className="font-semibold">Aparelhos</span>
        </header>
        <div className="flex min-h-screen flex-col bg-background">
          <main className="container mx-auto min-w-0 max-w-7xl flex-grow px-4 py-6 sm:py-8">
            {loading || error ? (
              <DataState loading={loading} error={error} onRetry={refetch} />
            ) : (
              <AppliancesTab
                appliances={appliances}
                onEdit={openEditModal}
                onDelete={openDeleteModal}
                onAddAppliance={handleAddAppliance}
                initialAddOpen={searchParams.get("adicionar") === "1"}
              />
            )}
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
        onOpenChange={(open) => !open && !deleting && closeDeleteModal()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o aparelho{" "}
              <strong>{deleteApplianceModal?.name}</strong>? Esta ação é
              permanente e não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting} onClick={closeDeleteModal}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteConfirm();
              }}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleting ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
};

export default Appliances;
