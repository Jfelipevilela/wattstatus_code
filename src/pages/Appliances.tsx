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
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-energy-green-light rounded flex items-center justify-center">
              <PlugZap className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold">Aparelhos</span>
          </div>
        </header>
        <div className="flex flex-col min-h-screen bg-background dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
          <main className="flex-grow container mx-auto px-4 pt-6 pb-10">
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
